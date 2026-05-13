const demoTableAliases: Record<string, { label: string; tableToken: string }> = {
  "demo-table-5": {
    label: "VIP 1",
    tableToken: "demo-vip-1"
  }
};

export function getTableDisplay(token: string) {
  const alias = demoTableAliases[token];
  if (alias) {
    return alias;
  }

  return {
    label: formatTableLabel(token),
    tableToken: token
  };
}

function formatTableLabel(token: string) {
  return token
    .replace("demo-", "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
