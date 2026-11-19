export interface ValidOrderItem {
  menu_item_id: number;
  quantity: number;
}

export interface ValidOrderRequest {
  restaurant_id: number;
  items: ValidOrderItem[];
}

export type ValidationResult =
  | { valid: true; value: ValidOrderRequest }
  | { valid: false; message: string; field?: string };

export const MAX_ITEMS_PER_ORDER = 50;
export const MAX_QUANTITY_PER_ITEM = 99;

export function validateOrderRequest(body: unknown): ValidationResult {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, message: 'Request body must be a JSON object', field: 'body' };
  }

  const payload = body as Record<string, unknown>;

  if (!('restaurant_id' in payload) || payload.restaurant_id === undefined || payload.restaurant_id === null) {
    return { valid: false, message: 'Missing required field: restaurant_id', field: 'restaurant_id' };
  }
  const restaurantId = payload.restaurant_id;
  if (typeof restaurantId !== 'number' || !Number.isInteger(restaurantId) || restaurantId <= 0) {
    return {
      valid: false,
      message: 'restaurant_id must be a positive integer',
      field: 'restaurant_id',
    };
  }

  if (!('items' in payload) || payload.items === undefined || payload.items === null) {
    return { valid: false, message: 'Missing required field: items', field: 'items' };
  }
  if (!Array.isArray(payload.items)) {
    return { valid: false, message: 'items must be an array', field: 'items' };
  }
  if (payload.items.length === 0) {
    return { valid: false, message: 'items must contain at least one menu item', field: 'items' };
  }
  if (payload.items.length > MAX_ITEMS_PER_ORDER) {
    return {
      valid: false,
      message: `items must contain at most ${MAX_ITEMS_PER_ORDER} entries`,
      field: 'items',
    };
  }

  const items: ValidOrderItem[] = [];
  for (let index = 0; index < payload.items.length; index += 1) {
    const raw = payload.items[index] as Record<string, unknown>;
    const path = `items[${index}]`;

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { valid: false, message: `${path} must be an object`, field: path };
    }
    if (!('menu_item_id' in raw) || raw.menu_item_id === undefined || raw.menu_item_id === null) {
      return { valid: false, message: `Missing required field: ${path}.menu_item_id`, field: `${path}.menu_item_id` };
    }
    if (typeof raw.menu_item_id !== 'number' || !Number.isInteger(raw.menu_item_id) || raw.menu_item_id <= 0) {
      return {
        valid: false,
        message: `${path}.menu_item_id must be a positive integer`,
        field: `${path}.menu_item_id`,
      };
    }

    if (!('quantity' in raw) || raw.quantity === undefined || raw.quantity === null) {
      return { valid: false, message: `Missing required field: ${path}.quantity`, field: `${path}.quantity` };
    }
    if (typeof raw.quantity !== 'number' || !Number.isInteger(raw.quantity)) {
      return {
        valid: false,
        message: `${path}.quantity must be an integer`,
        field: `${path}.quantity`,
      };
    }
    if (raw.quantity <= 0) {
      return {
        valid: false,
        message: `${path}.quantity must be greater than 0`,
        field: `${path}.quantity`,
      };
    }
    if (raw.quantity > MAX_QUANTITY_PER_ITEM) {
      return {
        valid: false,
        message: `${path}.quantity must not exceed ${MAX_QUANTITY_PER_ITEM}`,
        field: `${path}.quantity`,
      };
    }

    items.push({ menu_item_id: raw.menu_item_id, quantity: raw.quantity });
  }

  return { valid: true, value: { restaurant_id: restaurantId, items } };
}
