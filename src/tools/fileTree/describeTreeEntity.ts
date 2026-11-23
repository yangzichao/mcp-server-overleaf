import type { OverleafEntityType } from "../../overleaf/realtime/overleafTreeEntities.js";

const ENTITY_TYPE_NAMES: Readonly<Record<OverleafEntityType, string>> = {
  doc: "an editable document",
  file: "an uploaded binary file",
  folder: "a folder",
};

/** "an editable document", "an uploaded binary file" or "a folder". */
export function describeEntityType(type: OverleafEntityType): string {
  return ENTITY_TYPE_NAMES[type];
}
