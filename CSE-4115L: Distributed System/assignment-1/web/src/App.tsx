import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  formatMoney,
  orderApi,
  restaurantApi,
  type MenuItem,
  type Order,
  type Restaurant,
  type RestaurantSummary,
} from './api';

interface CartLine {
  menu_item_id: number;
  name: string;
  price_cents: number;
  quantity: number;
}

function App() {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<{ restaurant: string; order: string }>({
    restaurant: 'checking...',
    order: 'checking...',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRestaurants = useCallback(async () => {
    try {
      const data = await restaurantApi.list();
      setRestaurants(data.restaurants);
      setStatus((s) => ({ ...s, restaurant: 'ok' }));
      setError(null);
    } catch (err) {
      setStatus((s) => ({ ...s, restaurant: 'down' }));
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await orderApi.list();
      setOrders(data.orders.slice().reverse());
      setStatus((s) => ({ ...s, order: 'ok' }));
    } catch {
      setStatus((s) => ({ ...s, order: 'down' }));
    }
  }, []);

  useEffect(() => {
    void loadRestaurants();
    void loadOrders();
    const timer = window.setInterval(() => {
      void loadRestaurants();
      void loadOrders();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadRestaurants, loadOrders]);

  const openRestaurant = async (id: number) => {
    try {
      const detail = await restaurantApi.get(id);
      setSelected(detail);
      setCart([]);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.menu_item_id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.menu_item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        { menu_item_id: item.id, name: item.name, price_cents: item.price_cents, quantity: 1 },
      ];
    });
  };

  const changeQuantity = (menuItemId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.menu_item_id === menuItemId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const submitOrder = async () => {
    if (!selected || cart.length === 0) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const order = await orderApi.create(
        selected.id,
        cart.map((line) => ({ menu_item_id: line.menu_item_id, quantity: line.quantity })),
      );
      setNotice(
        `Order ${order.order_id} created (${order.status}) - correlation ${order.correlation_id.slice(0, 18)}...`,
      );
      setCart([]);
      await loadOrders();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`HTTP ${err.status}: ${err.message}`);
      } else {
        setError(String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const totalCents = cart.reduce((sum, line) => sum + line.price_cents * line.quantity, 0);
  const badge = (ok: boolean) => (ok ? 'badge badge-ok' : 'badge badge-down');

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Food Order Platform</h1>
          <p className="subtitle">
            Restaurant Service + Order Service &mdash; separate processes, HTTP boundary, shared Docker
            network.
          </p>
        </div>
        <div className="health">
          <span className={badge(status.restaurant === 'ok')}>
            restaurant-service: {status.restaurant}
          </span>
          <span className={badge(status.order === 'ok')}>order-service: {status.order}</span>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <main className="columns">
        <section className="panel">
          <h2>Restaurants</h2>
          <div className="cards">
            {restaurants.map((restaurant) => (
              <button
                key={restaurant.id}
                className={`card ${selected?.id === restaurant.id ? 'card-active' : ''}`}
                onClick={() => void openRestaurant(restaurant.id)}
              >
                <img src={restaurant.image_url} alt={restaurant.name} />
                <div className="card-body">
                  <strong>{restaurant.name}</strong>
                  <span className="muted">
                    {restaurant.cuisine} &middot; &#9733; {restaurant.rating.toFixed(1)} &middot;{' '}
                    {restaurant.item_count} items
                  </span>
                  <span className="muted small">{restaurant.address}</span>
                </div>
              </button>
            ))}
            {restaurants.length === 0 && <p className="muted">No restaurants loaded.</p>}
          </div>
        </section>

        <section className="panel">
          <h2>{selected ? selected.name : 'Menu'}</h2>
          {!selected && <p className="muted">Pick a restaurant to see its menu.</p>}
          {selected && (
            <>
              <ul className="menu">
                {selected.items.map((item) => (
                  <li key={item.id}>
                    <div className="menu-info">
                      <strong>{item.name}</strong>
                      <span className="muted small">{item.description}</span>
                    </div>
                    <span className="price">{formatMoney(item.price_cents, item.currency)}</span>
                    <button
                      className="btn btn-small"
                      disabled={!item.available}
                      onClick={() => addToCart(item)}
                    >
                      {item.available ? 'Add' : 'Sold out'}
                    </button>
                  </li>
                ))}
              </ul>

              <h3>Cart</h3>
              {cart.length === 0 ? (
                <p className="muted">Cart is empty.</p>
              ) : (
                <ul className="cart">
                  {cart.map((line) => (
                    <li key={line.menu_item_id}>
                      <span className="cart-name">{line.name}</span>
                      <span className="qty">
                        <button
                          className="btn btn-tiny"
                          onClick={() => changeQuantity(line.menu_item_id, -1)}
                        >
                          -
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          className="btn btn-tiny"
                          onClick={() => changeQuantity(line.menu_item_id, 1)}
                        >
                          +
                        </button>
                      </span>
                      <span className="price">{formatMoney(line.price_cents * line.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="checkout">
                <span className="total">Total: {formatMoney(totalCents)}</span>
                <button
                  className="btn btn-primary"
                  disabled={busy || cart.length === 0}
                  onClick={() => void submitOrder()}
                >
                  {busy ? 'Placing order...' : 'Place order'}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Recent orders</h2>
          {orders.length === 0 && <p className="muted">No orders yet.</p>}
          <ul className="orders">
            {orders.map((order) => (
              <li key={order.order_id}>
                <div className="order-head">
                  <span className="mono">{order.order_id}</span>
                  <span className="status">{order.status}</span>
                </div>
                <div className="muted small">
                  restaurant #{order.restaurant_id} &middot; {order.items.length} item(s) &middot;{' '}
                  {formatMoney(order.total_cents, order.currency)}
                </div>
                <div className="muted small">created {new Date(order.created_at).toLocaleString()}</div>
                <div className="muted small mono">correlation: {order.correlation_id}</div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
