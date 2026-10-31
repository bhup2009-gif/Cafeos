/** Local, generated HD photography. Preserve uploaded photos during menu upgrades. */
export const menuImages: Record<string, string> = {
  pizza: "/menu/pizza-v1.webp",
  chai: "/menu/chai-v1.webp",
  samosa: "/menu/samosa-v1.webp",
  "pizza-combo": "/menu/pizza-combo-v1.webp",
  cappuccino: "/menu/cappuccino-v1.webp",
  latte: "/menu/latte-v1.webp",
  americano: "/menu/americano-v1.webp",
  coldbrew: "/menu/coldbrew-v1.webp",
  matcha: "/menu/matcha-v1.webp",
  croissant: "/menu/croissant-v1.webp",
  sandwich: "/menu/sandwich-v1.webp",
  toast: "/menu/toast-v1.webp",
  brownie: "/menu/brownie-v1.webp",
  combo: "/menu/combo-v1.webp",
};
export const featuredMenuIds = ["pizza", "chai", "samosa", "pizza-combo"];
export const menuRank = (id: string) => {
  const index = featuredMenuIds.indexOf(id);
  return index < 0 ? featuredMenuIds.length : index;
};
export function isMenuImage(value: string) {
  return Object.values(menuImages).includes(value);
}
