"use client";
const KEY = "parti-cart-v1";

export type CartItem = {
  id: string;
  sku: string;
  productName: string;
  series: string;
  lengthMm: number;
  surfaceTreatment: string;
  preprocessing: string;
  remark: string;
  quantity: number;
  unitPrice: number;
};

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("cart-change"));
}

export function addToCart(item: CartItem) {
  const items = getCart();
  items.push(item);
  saveCart(items);
}

export function removeFromCart(id: string) {
  saveCart(getCart().filter((i) => i.id !== id));
}

export function updateCartItem(id: string, patch: Partial<CartItem>) {
  saveCart(getCart().map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export function clearCart() {
  saveCart([]);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}
