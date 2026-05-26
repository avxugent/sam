import {
  Monitor,
  Laptop,
  Printer,
  Server,
  Network,
  Phone,
  Tablet,
  Camera,
  Tv,
  HardDrive,
  Headphones,
  Mic,
  Volume2,
  Keyboard,
  MousePointer,
  Zap,
  ScanLine,
  Projector,
  Cpu,
  Wifi,
  Router,
  Package,
  type LucideIcon,
} from "lucide-react";

const KEYWORD_MAP: [string[], LucideIcon][] = [
  [["projector", "beamer"], Projector],
  [["laptop", "notebook", "macbook"], Laptop],
  [["tablet", "ipad", "pad"], Tablet],
  [["phone", "telephone", "gsm", "smartphone", "mobile"], Phone],
  [["tv", "television", "display", "smartboard", "board", "screen"], Tv],
  [["printer", "plotter"], Printer],
  [["scanner"], ScanLine],
  [["camera", "webcam"], Camera],
  [["server", "rack", "blade"], Server],
  [["router"], Router],
  [["switch", "network", "ethernet", "hub", "access point", "ap"], Network],
  [["wifi", "wireless"], Wifi],
  [["cpu", "processor"], Cpu],
  [["hard drive", "harddrive", "nas", "storage", "disk", "ssd", "hdd"], HardDrive],
  [["headphone", "headset"], Headphones],
  [["microphone", "mic"], Mic],
  [["speaker", "audio", "soundbar"], Volume2],
  [["keyboard"], Keyboard],
  [["mouse"], MousePointer],
  [["ups", "power supply", "pdu"], Zap],
  [["computer", "desktop", "workstation", "pc", "imac", "all-in-one"], Monitor],
];

export function getAssetTypeIcon(typeName: string | null | undefined): LucideIcon {
  if (!typeName) return Package;
  const lower = typeName.toLowerCase();
  for (const [keywords, icon] of KEYWORD_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return icon;
  }
  return Package;
}
