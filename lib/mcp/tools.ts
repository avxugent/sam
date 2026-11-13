import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/schemas/ids";
import { ASSET_DETAIL_INCLUDE, ASSET_LIST_INCLUDE } from "@/lib/assets/include";
import { STOCK_ITEM_ROW_INCLUDE } from "@/lib/stock/include";
import { getAllDescendantLocationIds, getAncestorChainsBatch, getLocationAncestors } from "@/lib/locations/path";
import { locationLabelPath, nestLocations, findFiNumber, type Nested } from "@/lib/locations/tree";
import { normalizeMacAddress } from "@/lib/mac-address";
import { assetDetail, assetSummary, errorResult, jsonResult, stockSummary } from "@/lib/mcp/format";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Locations listed in list_assets_by_model's breakdown; the full count and total units are still reported. */
const BY_LOCATION_MAX = 50;

const pageShape = {
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe("Page size (max 200)"),
  offset: z.number().int().min(0).default(0).describe("Rows to skip, for the next page"),
};

const statusSchema = z
  .enum(["INSTALLED", "IN_REPAIR", "DECOMMISSIONED", "ALL"])
  .default("INSTALLED")
  .describe("Asset lifecycle status; ALL includes decommissioned assets");

const statusWhere = (status: z.infer<typeof statusSchema>) => (status === "ALL" ? {} : { status });

const page = <T>(items: T[], total: number, limit: number, offset: number) =>
  jsonResult({ total, limit, offset, hasMore: offset + items.length < total, items });

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

type TreeNode = Nested<{
  id: string;
  name: string;
  parentId: string | null;
  fiNumber: string | null;
  assets: number;
  stockItems: number;
}>;

type Pruned = Omit<TreeNode, "children" | "parentId"> & { children?: Pruned[]; childCount: number };

function prune(node: TreeNode, depthLeft: number): Pruned {
  const { children, parentId: _parentId, ...rest } = node;
  void _parentId;
  return {
    ...rest,
    childCount: children.length,
    ...(depthLeft > 1 && children.length ? { children: children.map((c) => prune(c, depthLeft - 1)) } : {}),
  };
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    const hit = n.id === id ? n : findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Registers the read-only SAM inventory tools on a (per-request) MCP server. */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_location_tree",
    {
      description:
        "The location hierarchy (campus > building > floor > room) as a nested tree. Each node has its id, name, FI number, " +
        "the number of INSTALLED asset rows and stock items directly in it, and its child count.",
      inputSchema: {
        rootId: idSchema.optional().describe("Only this location's subtree; omit for the whole tree"),
        maxDepth: z.number().int().min(1).max(20).default(20).describe("Levels to return below and including the root"),
      },
      annotations: readOnly,
    },
    async ({ rootId, maxDepth }) => {
      const rows = await prisma.location.findMany({
        select: {
          id: true,
          name: true,
          parentId: true,
          fiNumber: true,
          _count: { select: { assets: { where: { status: "INSTALLED" } }, stockItems: true } },
        },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      });
      const tree = nestLocations(
        rows.map(({ _count, ...l }) => ({ ...l, assets: _count.assets, stockItems: _count.stockItems }))
      );
      if (!rootId) return jsonResult(tree.map((n) => prune(n, maxDepth)));
      const root = findNode(tree, rootId);
      return root ? jsonResult(prune(root, maxDepth)) : errorResult(`Location ${rootId} not found.`);
    }
  );

  server.registerTool(
    "find_locations",
    {
      description: "Find locations by (part of) their name or FI number; returns ids and full paths for use in other tools.",
      inputSchema: { q: z.string().trim().min(1).max(255), ...pageShape },
      annotations: readOnly,
    },
    async ({ q, limit, offset }) => {
      const where = { OR: [{ name: { contains: q } }, { fiNumber: { contains: q } }] };
      const [rows, total] = await Promise.all([
        prisma.location.findMany({
          where,
          select: { id: true, name: true, fiNumber: true },
          orderBy: { name: "asc" },
          skip: offset,
          take: limit,
        }),
        prisma.location.count({ where }),
      ]);
      const chains = await getAncestorChainsBatch(rows.map((r) => r.id));
      const items = rows.map((r) => ({ ...r, path: locationLabelPath((chains.get(r.id)?.names ?? [r.name]).map((name) => ({ name }))) }));
      return page(items, total, limit, offset);
    }
  );

  server.registerTool(
    "get_location",
    {
      description: "One location: its path from the campus down, FI number, address, and direct children with their ids.",
      inputSchema: { locationId: idSchema },
      annotations: readOnly,
    },
    async ({ locationId }) => {
      const loc = await prisma.location.findUnique({
        where: { id: locationId },
        select: {
          id: true,
          name: true,
          description: true,
          fiNumber: true,
          address: true,
          city: true,
          country: true,
          inMaintenance: true,
          children: { select: { id: true, name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] },
          _count: { select: { assets: { where: { status: "INSTALLED" } }, stockItems: true } },
        },
      });
      if (!loc) return errorResult(`Location ${locationId} not found.`);
      const ancestors = await getLocationAncestors(locationId);
      const { _count, ...rest } = loc;
      return jsonResult({
        ...rest,
        path: locationLabelPath(ancestors),
        fiNumber: loc.fiNumber ?? findFiNumber(ancestors),
        assets: _count.assets,
        stockItems: _count.stockItems,
      });
    }
  );

  server.registerTool(
    "list_assets_by_location",
    {
      description: "Assets installed in a location (by default including all locations below it).",
      inputSchema: {
        locationId: idSchema,
        includeDescendants: z.boolean().default(true).describe("Also include sub-locations (rooms in a building, ...)"),
        status: statusSchema,
        ...pageShape,
      },
      annotations: readOnly,
    },
    async ({ locationId, includeDescendants, status, limit, offset }) => {
      const exists = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } });
      if (!exists) return errorResult(`Location ${locationId} not found.`);
      const ids = includeDescendants ? [locationId, ...(await getAllDescendantLocationIds(locationId))] : [locationId];
      const where = { locationId: { in: ids }, ...statusWhere(status) };
      const [assets, total] = await Promise.all([
        prisma.asset.findMany({
          where,
          include: ASSET_LIST_INCLUDE,
          orderBy: [{ location: { name: "asc" } }, { hostname: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
        }),
        prisma.asset.count({ where }),
      ]);
      return page(assets.map(assetSummary), total, limit, offset);
    }
  );

  server.registerTool(
    "list_stock_by_location",
    {
      description: "Stock items (spares not installed anywhere) stored in a location, including sub-locations by default.",
      inputSchema: { locationId: idSchema, includeDescendants: z.boolean().default(true), ...pageShape },
      annotations: readOnly,
    },
    async ({ locationId, includeDescendants, limit, offset }) => {
      const exists = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } });
      if (!exists) return errorResult(`Location ${locationId} not found.`);
      const ids = includeDescendants ? [locationId, ...(await getAllDescendantLocationIds(locationId))] : [locationId];
      const where = { locationId: { in: ids } };
      const [items, total] = await Promise.all([
        prisma.stockItem.findMany({
          where,
          include: STOCK_ITEM_ROW_INCLUDE,
          orderBy: [{ model: { name: "asc" } }, { id: "asc" }],
          skip: offset,
          take: limit,
        }),
        prisma.stockItem.count({ where }),
      ]);
      return page(items.map(stockSummary), total, limit, offset);
    }
  );

  server.registerTool(
    "list_models",
    {
      description: "Find asset models by name, type or manufacturer; returns model ids for list_assets_by_model.",
      inputSchema: {
        q: z.string().trim().max(255).optional().describe("Part of the model name"),
        typeId: idSchema.optional(),
        manufacturerId: idSchema.optional(),
        ...pageShape,
      },
      annotations: readOnly,
    },
    async ({ q, typeId, manufacturerId, limit, offset }) => {
      const where = {
        ...(q ? { name: { contains: q } } : {}),
        ...(typeId ? { typeId } : {}),
        ...(manufacturerId ? { manufacturerId } : {}),
      };
      const [models, total] = await Promise.all([
        prisma.model.findMany({
          where,
          select: { id: true, name: true, type: { select: { id: true, name: true } }, manufacturer: { select: { id: true, name: true } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
        }),
        prisma.model.count({ where }),
      ]);
      return page(models, total, limit, offset);
    }
  );

  server.registerTool(
    "list_assets_by_model",
    {
      description:
        `Assets of one model across all locations, with the total number of units and a per-location breakdown (the ${BY_LOCATION_MAX} locations with the most units; locationCount is the full number of locations).`,
      inputSchema: { modelId: idSchema, status: statusSchema, ...pageShape },
      annotations: readOnly,
    },
    async ({ modelId, status, limit, offset }) => {
      const model = await prisma.model.findUnique({
        where: { id: modelId },
        select: { id: true, name: true, manufacturer: { select: { name: true } }, type: { select: { name: true } } },
      });
      if (!model) return errorResult(`Model ${modelId} not found.`);
      const where = { modelId, ...statusWhere(status) };
      const [assets, total, perLocation] = await Promise.all([
        prisma.asset.findMany({
          where,
          include: ASSET_LIST_INCLUDE,
          orderBy: [{ location: { name: "asc" } }, { hostname: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
        }),
        prisma.asset.count({ where }),
        prisma.asset.groupBy({ by: ["locationId"], where, _sum: { quantity: true } }),
      ]);
      const unitsOf = (p: (typeof perLocation)[number]) => p._sum.quantity ?? 0;
      const topLocations = [...perLocation]
        .sort((a, b) => unitsOf(b) - unitsOf(a) || a.locationId.localeCompare(b.locationId))
        .slice(0, BY_LOCATION_MAX);
      const locations = await prisma.location.findMany({
        where: { id: { in: topLocations.map((p) => p.locationId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(locations.map((l) => [l.id, l.name]));
      const byLocation = topLocations.map((p) => ({
        locationId: p.locationId,
        location: nameById.get(p.locationId) ?? null,
        units: unitsOf(p),
      }));
      const items = assets.map(assetSummary);
      return jsonResult({
        model: { id: model.id, name: model.name, manufacturer: model.manufacturer?.name ?? null, type: model.type.name },
        totalUnits: perLocation.reduce((sum, p) => sum + unitsOf(p), 0),
        locationCount: perLocation.length,
        byLocation,
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
        items,
      });
    }
  );

  server.registerTool(
    "find_asset",
    {
      description: "Find assets by hostname, serial number or MAC address (partial match). Use get_asset for full details.",
      inputSchema: { q: z.string().trim().min(2).max(255), status: statusSchema, ...pageShape },
      annotations: readOnly,
    },
    async ({ q, status, limit, offset }) => {
      const mac = normalizeMacAddress(q);
      const where = {
        ...statusWhere(status),
        OR: [
          { hostname: { contains: q } },
          { serialNumber: { contains: q } },
          ...(mac ? [{ macAddresses: { some: { address: mac } } }] : []),
        ],
      };
      const [assets, total] = await Promise.all([
        prisma.asset.findMany({
          where,
          include: ASSET_LIST_INCLUDE,
          orderBy: [{ hostname: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
        }),
        prisma.asset.count({ where }),
      ]);
      return page(assets.map(assetSummary), total, limit, offset);
    }
  );

  server.registerTool(
    "get_asset",
    {
      description: "Full details of one asset: identity, location path, warranty, MAC addresses and custom fields.",
      inputSchema: { assetId: idSchema },
      annotations: readOnly,
    },
    async ({ assetId }) => {
      const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: ASSET_DETAIL_INCLUDE });
      if (!asset) return errorResult(`Asset ${assetId} not found.`);
      const path = locationLabelPath(await getLocationAncestors(asset.location.id));
      return jsonResult(assetDetail(asset, path));
    }
  );

  server.registerTool(
    "list_asset_types",
    { description: "All asset types with their ids (for filtering list_models).", inputSchema: {}, annotations: readOnly },
    async () => jsonResult(await prisma.assetType.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }))
  );

  server.registerTool(
    "list_manufacturers",
    { description: "All manufacturers with their ids (for filtering list_models).", inputSchema: {}, annotations: readOnly },
    async () => jsonResult(await prisma.manufacturer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }))
  );
}
