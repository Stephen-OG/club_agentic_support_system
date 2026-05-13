export const requestPriorities = ["low", "normal", "high", "urgent"] as const;

export type RequestPriority = (typeof requestPriorities)[number];

type PriorityRule = {
  priority: RequestPriority;
  match: RegExp;
};

const priorityRules: PriorityRule[] = [
  {
    priority: "urgent",
    match:
      /\b(safety|medical|medic|allerg(?:y|ic|ies)|anaphylaxis|chok(?:e|ing)|can't breathe|cannot breathe|injur(?:y|ed)|blood|fire|smoke|fight|harass(?:ed|ment)|threat(?:en|ening)?|assault|broken glass|security|danger|emergency)\b/i
  },
  {
    priority: "high",
    match:
      /\b(spill(?:ed)?|wrong order|missing food|long wait|waiting too long|angry|upset|refund issue|payment issue|overcharged|restroom issue|bathroom issue|leak(?:ing)?|broken item|cold food)\b/i
  },
  {
    priority: "normal",
    match:
      /\b(bill|payment help|refill|utensils?|cutlery|spoon|fork|knife|napkins?|tissues?|water|order help|menu|service request|help)\b/i
  },
  {
    priority: "low",
    match:
      /\b(wi-?fi|password|music|recommendations?|information|opening times?|lost property|general questions?|question)\b/i
  }
];

export function classifyPriority(message: string): RequestPriority | null {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return null;
  }

  return priorityRules.find((rule) => rule.match.test(normalizedMessage))?.priority || null;
}

export function priorityRank(priority: RequestPriority) {
  return requestPriorities.indexOf(priority);
}

export function strongerPriority(left: RequestPriority, right: RequestPriority) {
  return priorityRank(left) > priorityRank(right) ? left : right;
}
