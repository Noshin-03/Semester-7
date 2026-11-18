import type { MenuItem, Restaurant } from './seed';

export type { MenuItem, Restaurant };

/** Public shape returned by GET /restaurants (list, without nested items). */
export interface RestaurantSummary {
  id: number;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  image_url: string;
  item_count: number;
}

export function toSummary(restaurant: Restaurant): RestaurantSummary {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    address: restaurant.address,
    rating: restaurant.rating,
    image_url: restaurant.image_url,
    item_count: restaurant.items.length,
  };
}
