import { useEffect, useState } from "react";
import type { OrganizationNode } from "@shared/organization";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

type OrganizationRoleFieldsProps = {
  node: OrganizationNode;
  disabled: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<OrganizationNode>) => void;
  resetKey: number;
  roomy?: boolean;
};

export function OrganizationRoleFields({ node, disabled, onSelect, onPatch, resetKey, roomy = false }: OrganizationRoleFieldsProps) {
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
  const fieldColors = roomy ? "text-foreground placeholder:text-muted-foreground" : "text-slate-900! placeholder:text-slate-500!";
  const error = titleError ? "Bitte einen Rollennamen eingeben." : peopleError;

  return (
    <div className={roomy ? "space-y-4" : "min-h-0 space-y-1"} onContextMenu={(event) => event.stopPropagation()}>
      {roomy && <label className="block text-sm font-medium" htmlFor={`org-inline-people-${node.id}`}>Personen – ein Name je Zeile</label>}
      <Textarea
        id={`org-inline-people-${node.id}`}
        aria-label="Personen – ein Name je Zeile"
        aria-invalid={Boolean(peopleError)}
        aria-describedby={peopleError ? errorId : undefined}
        rows={roomy ? 3 : 1}
        value={peopleDraft}
        disabled={disabled}
        onFocus={onSelect}
        onChange={(event) => {
          const value = event.target.value;
          setPeopleDraft(value);
          onPatch({ people: value.split("\n").filter((name) => name.trim()) });
        }}
        placeholder="Name der Person"
        className={cn("text-lg font-medium leading-7 focus-visible:border-green-700 focus-visible:ring-green-700", fieldColors, roomy ? "min-h-24 resize-y border-input bg-background p-3" : "h-9 min-h-0 max-md:min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 hover:border-slate-400/50")}
      />
      {roomy && <label className="block text-sm font-medium" htmlFor={`org-inline-title-${node.id}`}>Funktion / Ebene</label>}
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
        className={cn("font-bold focus-visible:border-green-700 focus-visible:ring-green-700", fieldColors, roomy ? "min-h-11 border-input bg-background px-3 text-base" : "h-6 max-md:min-h-0 border-transparent bg-transparent px-1 py-0 text-sm hover:border-slate-400/50")}
      />
      {roomy && <label className="block text-sm font-medium" htmlFor={`org-inline-description-${node.id}`}>Aufgaben / Zuständigkeiten</label>}
      <Textarea
        id={`org-inline-description-${node.id}`}
        aria-label="Aufgaben und Zuständigkeiten"
        rows={roomy ? 4 : 2}
        value={node.description}
        maxLength={2000}
        disabled={disabled}
        onFocus={onSelect}
        onChange={(event) => onPatch({ description: event.target.value })}
        placeholder="Aufgaben / Zuständigkeiten"
        className={cn("focus-visible:border-green-700 focus-visible:ring-green-700", fieldColors, roomy ? "min-h-24 resize-y border-input bg-background p-3 text-base" : "h-10 min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-slate-400/50")}
      />
      {error && <p id={errorId} role="alert" title={error} className="wrap-anywhere text-xs leading-tight text-red-800!">{error}</p>}
    </div>
  );
}
