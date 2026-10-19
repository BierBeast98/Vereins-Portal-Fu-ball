import { useEffect, useState } from "react";
import type { OrganizationNode } from "@shared/organization";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type OrganizationRoleFieldsProps = {
  node: OrganizationNode;
  disabled: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<OrganizationNode>) => void;
  resetKey: number;
};

export function OrganizationRoleFields({ node, disabled, onSelect, onPatch, resetKey }: OrganizationRoleFieldsProps) {
  const [peopleDraft, setPeopleDraft] = useState(() => node.people.join("\n"));

  // Keep the raw text while typing: a trailing newline is needed to enter the next person.
  // A load/save or switching this component to another role explicitly resets the draft.
  useEffect(() => {
    setPeopleDraft(node.people.join("\n"));
  }, [node.id, resetKey]);

  const people = peopleDraft.split("\n").filter((name) => name.trim());
  const titleError = !node.title.trim();
  const peopleError = people.length > 20
    ? "Höchstens 20 Personen pro Rolle."
    : people.some((name) => name.trim().length > 100)
      ? "Namen dürfen höchstens 100 Zeichen haben."
      : "";
  const errorId = `org-inline-error-${node.id}`;
  const error = titleError ? "Bitte einen Rollennamen eingeben." : peopleError;

  return (
    <div className="min-h-0 space-y-1" onContextMenu={(event) => event.stopPropagation()}>
      <Textarea
        id={`org-inline-people-${node.id}`}
        aria-label="Personen – ein Name je Zeile"
        aria-invalid={Boolean(peopleError)}
        aria-describedby={peopleError ? errorId : undefined}
        rows={1}
        value={peopleDraft}
        disabled={disabled}
        onFocus={onSelect}
        onChange={(event) => {
          const value = event.target.value;
          setPeopleDraft(value);
          onPatch({ people: value.split("\n").filter((name) => name.trim()) });
        }}
        placeholder="Name der Person"
        className="h-9 min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 text-lg font-medium leading-7 hover:border-slate-400/50 !text-slate-900 placeholder:!text-slate-500 focus-visible:border-green-700 focus-visible:ring-green-700"
      />
      <Input
        id={`org-inline-title-${node.id}`}
        aria-label="Funktion oder Ebene"
        aria-invalid={titleError}
        aria-describedby={titleError ? errorId : undefined}
        value={node.title}
        maxLength={120}
        disabled={disabled}
        onFocus={onSelect}
        onChange={(event) => onPatch({ title: event.target.value })}
        placeholder="Funktion / Ebene"
        className="h-6 border-transparent bg-transparent px-1 py-0 text-sm font-bold hover:border-slate-400/50 !text-slate-900 placeholder:!text-slate-500 focus-visible:border-green-700 focus-visible:ring-green-700"
      />
      <Textarea
        id={`org-inline-description-${node.id}`}
        aria-label="Aufgaben und Zuständigkeiten"
        rows={2}
        value={node.description}
        maxLength={2000}
        disabled={disabled}
        onFocus={onSelect}
        onChange={(event) => onPatch({ description: event.target.value })}
        placeholder="Aufgaben / Zuständigkeiten"
        className="h-10 min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 text-xs !text-slate-700 placeholder:!text-slate-500 hover:border-slate-400/50 focus-visible:border-green-700 focus-visible:ring-green-700"
      />
      {error && <p id={errorId} role="alert" title={error} className="truncate text-[10px] leading-tight !text-red-800">{error}</p>}
    </div>
  );
}
