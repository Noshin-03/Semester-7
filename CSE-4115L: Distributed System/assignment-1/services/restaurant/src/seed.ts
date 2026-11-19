export interface MenuItem {
  id: number;
  name: string;
  price_cents: number;
  currency: string;
  description: string;
  available: boolean;
}

export interface Restaurant {
  id: number;
  name: string;
  cuisine: string;
  address: string;
  rating: number;
  image_url: string;
  items: MenuItem[];
}

export const SEED_RESTAURANTS: Restaurant[] = [
  {
    id: 1,
    name: 'Bella Pizza Napoli',
    cuisine: 'Italian',
    address: '12 Harbour Road, Dhaka',
    rating: 4.6,
    image_url: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=800',
    items: [
      {
        id: 101,
        name: 'Margherita',
        price_cents: 950,
        currency: 'BDT',
        description: 'San Marzano tomato, fior di latte, basil, olive oil',
        available: true,
      },
      {
        id: 102,
        name: 'Diavola',
        price_cents: 1250,
        currency: 'BDT',
        description: 'Spicy salami, mozzarella, chilli honey',
        available: true,
      },
      {
        id: 103,
        name: 'Quattro Formaggi',
        price_cents: 1450,
        currency: 'BDT',
        description: 'Mozzarella, gorgonzola, parmesan, blue cheese',
        available: false,
      },
    ],
  },
  {
    id: 2,
    name: 'Saffron Spice House',
    cuisine: 'Bangladeshi',
    address: '48 Gulshan Avenue, Dhaka',
    rating: 4.4,
    image_url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
    items: [
      {
        id: 201,
        name: 'Chicken Biryani',
        price_cents: 320,
        currency: 'BDT',
        description: 'Saffron rice, slow-cooked chicken, raita, pickled onion',
        available: true,
      },
      {
        id: 202,
        name: 'Beef Kala Bhuna',
        price_cents: 420,
        currency: 'BDT',
        description: 'Slow-fried beef in dark spice gravy with steamed rice',
        available: true,
      },
      {
        id: 203,
        name: 'Vegetable Khichuri',
        price_cents: 260,
        currency: 'BDT',
        description: 'Lentils and rice with seasonal vegetables and egg optional',
        available: true,
      },
    ],
  },
  {
    id: 3,
    name: 'Tokyo Ramen Bar',
    cuisine: 'Japanese',
    address: '5 Gulshan 1, Dhaka',
    rating: 4.8,
    image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800',
    items: [
      {
        id: 301,
        name: 'Tonkotsu Ramen',
        price_cents: 780,
        currency: 'BDT',
        description: '12-hour pork bone broth, chashu, egg, nori',
        available: true,
      },
      {
        id: 302,
        name: 'Spicy Miso Ramen',
        price_cents: 820,
        currency: 'BDT',
        description: 'Red miso paste, corn, butter, bamboo shoots',
        available: true,
      },
      {
        id: 303,
        name: 'Chicken Gyoza (6 pcs)',
        price_cents: 450,
        currency: 'BDT',
        description: 'Pan-fried dumplings with soy dipping sauce',
        available: true,
      },
    ],
  },
  {
    id: 4,
    name: 'Green Bowl Kitchen',
    cuisine: 'Healthy',
    address: '22 Dhanmondi 27, Dhaka',
    rating: 4.2,
    image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
    items: [
      {
        id: 401,
        name: 'Quinoa Power Bowl',
        price_cents: 550,
        currency: 'BDT',
        description: 'Quinoa, grilled chicken, avocado, tahini dressing',
        available: true,
      },
      {
        id: 402,
        name: 'Mediterranean Falafel Wrap',
        price_cents: 390,
        currency: 'BDT',
        description: 'Falafel, hummus, pickled turnip, flatbread',
        available: true,
      },
      {
        id: 403,
        name: 'Cold Pressed Green Juice',
        price_cents: 280,
        currency: 'BDT',
        description: 'Spinach, apple, celery, ginger, lime',
        available: true,
      },
    ],
  },
];

export function cloneSeedRestaurants(): Restaurant[] {
  return SEED_RESTAURANTS.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) }));
}
