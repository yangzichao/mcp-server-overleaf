/**
 * Crossref's `author` and `editor` lists as a BibTeX name list. People come as `family` and
 * `given` (with an optional `suffix`) and become `Family, Given`, the form BibTeX cannot
 * misread; organisations come as `name` and are braced whole, so `World Health Organization`
 * is not read as a person called Organization. BibTeX 0.99d confirms each reading below.
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

/** BibTeX splits a name list at the word "and" in any case, so one inside a name is braced. */
function protectAnd(part: string): string {
  return part.replace(/(^| )(and)(?= |$)/gi, "$1{$2}");
}

/**
 * A family name with no given name, written so BibTeX reads it all as the last name. Bare
 * "Garcia Perez" reads as First "Garcia", and a trailing comma is an error, so the name is
 * braced; one that starts with a particle, as "de La Fontaine", stays bare, which BibTeX reads
 * as von "de" and Last "La Fontaine", where braces would hide the particle.
 */
function familyOnly(family: string): string {
  if (!family.includes(" ") || /^[a-z]/.test(family)) return protectAnd(family);
  return `{${family}}`;
}

function bibtexName(person: CrossrefPerson): string | undefined {
  const family = text(person?.family);
  const given = protectAnd(text(person?.given));
  const suffix = protectAnd(text(person?.suffix));
  if (family !== "") {
    if (given === "") return familyOnly(family);
    const familyPart = protectAnd(family);
    return suffix === "" ? `${familyPart}, ${given}` : `${familyPart}, ${suffix}, ${given}`;
  }
  const name = text(person?.name) || given;
  return name === "" ? undefined : `{${name}}`;
}

export function crossrefNameList(people: unknown): string | undefined {
  if (!Array.isArray(people)) return undefined;
  const names = people.flatMap((person: CrossrefPerson) => bibtexName(person) ?? []);
  return names.length === 0 ? undefined : names.join(" and ");
}
