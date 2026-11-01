"use client";

import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The "Add" button of a catalog list: a spinner while adding, disabled until a name is typed. */
export function AddButton({ name, adding, onAdd }: { name: string; adding: boolean; onAdd: () => void }) {
  const tCommon = useTranslations("common");
  return (
    <Button onClick={onAdd} disabled={adding || !name.trim()}>
      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {tCommon("add")}
    </Button>
  );
}

/** Name input plus AddButton above a catalog list; Enter adds too. */
export function AddNameRow({
  name,
  onNameChange,
  placeholder,
  adding,
  onAdd,
}: {
  name: string;
  onNameChange: (name: string) => void;
  placeholder: string;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
        className="max-w-sm"
      />
      <AddButton name={name} adding={adding} onAdd={onAdd} />
    </div>
  );
}
