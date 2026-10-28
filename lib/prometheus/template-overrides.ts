import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateTemplate } from "@/lib/prometheus/scrape-template";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

/**
 * Per-asset-type scrape template overrides, either per manufacturer or per
 * manufacturer + model. Both kinds share one lifecycle; a store supplies the
 * typed Prisma calls for its table. Route handlers do their own auth checks
 * and then delegate here.
 */

export type TemplateOverride = {
  id: string;
  manufacturerId: string;
  manufacturerName: string;
  model?: string;
  scrapeTargetTemplate: string;
};

type CreateInput = { manufacturerId: string; scrapeTargetTemplate: string; model?: string };

type OverrideStore = {
  entityType: string;
  createSchema: z.ZodType<CreateInput>;
  list(typeId: string): Promise<TemplateOverride[]>;
  find(id: string): Promise<(TemplateOverride & { typeName: string }) | null>;
  create(typeId: string, input: CreateInput, manufacturerName: string): Promise<TemplateOverride>;
  update(id: string, scrapeTargetTemplate: string, existing: TemplateOverride): Promise<TemplateOverride>;
  remove(id: string): Promise<void>;
};

const scrapeTargetTemplate = z.string().min(1).max(10000);
const updateSchema = z.object({ scrapeTargetTemplate });

/** "Dell" or "Dell / XPS 13" — how an override is named in audit entries and errors. */
function overrideName(o: { manufacturerName: string; model?: string }) {
  return o.model ? `${o.manufacturerName} / ${o.model}` : o.manufacturerName;
}

export const manufacturerTemplates: OverrideStore = {
  entityType: "AssetTypeManufacturerTemplate",
  createSchema: z.object({ manufacturerId: z.string().min(1), scrapeTargetTemplate }),
  async list(typeId) {
    const rows = await prisma.assetTypeManufacturerTemplate.findMany({
      where: { typeId },
      select: { id: true, manufacturerId: true, scrapeTargetTemplate: true, manufacturer: { select: { name: true } } },
      orderBy: { manufacturer: { name: "asc" } },
    });
    return rows.map(({ manufacturer, ...o }) => ({ ...o, manufacturerName: manufacturer.name }));
  },
  async find(id) {
    const row = await prisma.assetTypeManufacturerTemplate.findUnique({
      where: { id },
      include: { type: { select: { name: true } }, manufacturer: { select: { name: true } } },
    });
    return row && {
      id: row.id,
      manufacturerId: row.manufacturerId,
      manufacturerName: row.manufacturer.name,
      scrapeTargetTemplate: row.scrapeTargetTemplate,
      typeName: row.type.name,
    };
  },
  async create(typeId, input, manufacturerName) {
    const row = await prisma.assetTypeManufacturerTemplate.create({
      data: { typeId, manufacturerId: input.manufacturerId, scrapeTargetTemplate: input.scrapeTargetTemplate },
    });
    return { id: row.id, manufacturerId: row.manufacturerId, manufacturerName, scrapeTargetTemplate: row.scrapeTargetTemplate };
  },
  async update(id, template, existing) {
    const row = await prisma.assetTypeManufacturerTemplate.update({ where: { id }, data: { scrapeTargetTemplate: template } });
    return { ...existing, scrapeTargetTemplate: row.scrapeTargetTemplate };
  },
  async remove(id) {
    await prisma.assetTypeManufacturerTemplate.delete({ where: { id } });
  },
};

export const modelTemplates: OverrideStore = {
  entityType: "AssetTypeModelTemplate",
  createSchema: z.object({ manufacturerId: z.string().min(1), model: z.string().min(1).max(255), scrapeTargetTemplate }),
  async list(typeId) {
    const rows = await prisma.assetTypeModelTemplate.findMany({
      where: { typeId },
      select: { id: true, manufacturerId: true, model: true, scrapeTargetTemplate: true, manufacturer: { select: { name: true } } },
      orderBy: [{ manufacturer: { name: "asc" } }, { model: "asc" }],
    });
    return rows.map(({ manufacturer, ...o }) => ({ ...o, manufacturerName: manufacturer.name }));
  },
  async find(id) {
    const row = await prisma.assetTypeModelTemplate.findUnique({
      where: { id },
      include: { type: { select: { name: true } }, manufacturer: { select: { name: true } } },
    });
    return row && {
      id: row.id,
      manufacturerId: row.manufacturerId,
      manufacturerName: row.manufacturer.name,
      model: row.model,
      scrapeTargetTemplate: row.scrapeTargetTemplate,
      typeName: row.type.name,
    };
  },
  async create(typeId, input, manufacturerName) {
    const row = await prisma.assetTypeModelTemplate.create({
      data: {
        typeId,
        manufacturerId: input.manufacturerId,
        model: input.model ?? "",
        scrapeTargetTemplate: input.scrapeTargetTemplate,
      },
    });
    return {
      id: row.id,
      manufacturerId: row.manufacturerId,
      manufacturerName,
      model: row.model,
      scrapeTargetTemplate: row.scrapeTargetTemplate,
    };
  },
  async update(id, template, existing) {
    const row = await prisma.assetTypeModelTemplate.update({ where: { id }, data: { scrapeTargetTemplate: template } });
    return { ...existing, scrapeTargetTemplate: row.scrapeTargetTemplate };
  },
  async remove(id) {
    await prisma.assetTypeModelTemplate.delete({ where: { id } });
  },
};

function templateSyntaxError(template: string) {
  const errors = validateTemplate(template);
  return errors.length > 0
    ? NextResponse.json({ error: "Template syntax error", details: errors }, { status: 400 })
    : null;
}

export async function listTemplateOverrides(store: OverrideStore, typeId: string) {
  return NextResponse.json(await store.list(typeId));
}

export async function createTemplateOverride(req: Request, session: Session, store: OverrideStore, typeId: string) {
  const type = await prisma.assetType.findUnique({ where: { id: typeId }, select: { id: true, name: true } });
  if (!type) return NextResponse.json({ error: "Asset type not found" }, { status: 404 });

  const parsed = store.createSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const syntaxError = templateSyntaxError(parsed.data.scrapeTargetTemplate);
  if (syntaxError) return syntaxError;

  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: parsed.data.manufacturerId },
    select: { name: true },
  });
  if (!manufacturer) return NextResponse.json({ error: "Manufacturer not found" }, { status: 404 });
  const name = overrideName({ manufacturerName: manufacturer.name, model: parsed.data.model });

  let created: TemplateOverride;
  try {
    created = await store.create(typeId, parsed.data, manufacturer.name);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: `${name} already has a scrape template override for this asset type.` },
        { status: 409 }
      );
    }
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: store.entityType,
    entityId: created.id,
    entityName: `${type.name} / ${name}`,
  });
  return NextResponse.json(created, { status: 201 });
}

export async function updateTemplateOverride(req: Request, session: Session, store: OverrideStore, id: string) {
  const existing = await store.find(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const syntaxError = templateSyntaxError(parsed.data.scrapeTargetTemplate);
  if (syntaxError) return syntaxError;

  const { typeName, ...override } = existing;
  const updated = await store.update(id, parsed.data.scrapeTargetTemplate, override);
  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: store.entityType,
    entityId: id,
    entityName: `${typeName} / ${overrideName(existing)}`,
  });
  return NextResponse.json(updated);
}

export async function deleteTemplateOverride(req: Request, session: Session, store: OverrideStore, id: string) {
  const existing = await store.find(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await store.remove(id);
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: store.entityType,
    entityId: id,
    entityName: `${existing.typeName} / ${overrideName(existing)}`,
  });
  return NextResponse.json({ ok: true });
}
