/**
 * Crossref's `author` and `editor` lists as a BibTeX name list. People come as `family` and
 * `given` (with an optional `suffix`) and become `Family, Given`, the form BibTeX cannot
 * misread; organisations come as `name` and are braced whole, so `World Health Organization`
 * is not read as a person called Organization.
 */

interface CrossrefPerson {
  readonly given?: unknown;
  readonly family?: unknown;
  readonly suffix?: unknown;
  readonly name?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function bibtexName(person: CrossrefPerson): string | undefined {
  const family = text(person?.family);
  const given = text(person?.given);
  const suffix = text(person?.suffix);
  if (family !== "") {
    if (given === "") return family;
    return suffix === "" ? `${family}, ${given}` : `${family}, ${suffix}, ${given}`;
  }
  const name = text(person?.name) || given;
  return name === "" ? undefined : `{${name}}`;
}

export function crossrefNameList(people: unknown): string | undefined {
  if (!Array.isArray(people)) return undefined;
  const names = people.flatMap((person: CrossrefPerson) => bibtexName(person) ?? []);
  return names.length === 0 ? undefined : names.join(" and ");
}
