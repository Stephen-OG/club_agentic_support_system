export type MenuSectionDraft = {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type MenuItemDraft = {
  sectionId: string;
  name: string;
  description?: string;
  priceLabel?: string;
  dietaryTags?: string;
  allergens?: string;
  available?: boolean;
  sortOrder?: number;
};

export function parseTagInput(value: string | undefined) {
  return (value ?? "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createMenuSectionPayload(draft: MenuSectionDraft) {
  return {
    name: draft.name.trim(),
    ...(typeof draft.sortOrder === "number" ? { sortOrder: draft.sortOrder } : {}),
    ...(typeof draft.isActive === "boolean" ? { isActive: draft.isActive } : {})
  };
}

export function createMenuItemPayload(draft: MenuItemDraft) {
  const description = draft.description?.trim() || null;
  const priceLabel = draft.priceLabel?.trim() || null;

  return {
    sectionId: draft.sectionId,
    name: draft.name.trim(),
    description,
    priceLabel,
    dietaryTags: parseTagInput(draft.dietaryTags),
    allergens: parseTagInput(draft.allergens),
    ...(typeof draft.available === "boolean" ? { available: draft.available } : {}),
    ...(typeof draft.sortOrder === "number" ? { sortOrder: draft.sortOrder } : {})
  };
}
