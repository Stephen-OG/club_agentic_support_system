export const supportQuickActions = [
  { id: "drink", label: "Get a drink", prompt: "I would like to order a drink." },
  { id: "missing_order", label: "Missing order", prompt: "My order is missing or wrong." },
  { id: "long_wait", label: "Long wait", prompt: "I have been waiting too long." },
  { id: "spill", label: "Spill or glass", prompt: "There is a spill or broken glass nearby." },
  { id: "lost_property", label: "Lost property", prompt: "I need help with lost property." },
  { id: "payment", label: "Payment issue", prompt: "I need help with my bill or payment." },
  { id: "restroom", label: "Toilet issue", prompt: "There is a toilet or restroom issue." },
  { id: "safety", label: "Safety or security", prompt: "I need help with a safety or security concern." }
] as const;

export const supportLocationOptions = [
  "Table",
  "Bar area",
  "Dance floor",
  "VIP booth",
  "Outside",
  "Toilet/restroom",
  "Entrance/queue",
  "Not seated"
] as const;
