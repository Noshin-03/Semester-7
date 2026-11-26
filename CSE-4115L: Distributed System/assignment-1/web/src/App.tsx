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

type Health = 'checking' | 'ok' | 'down';

interface Problem {
  status: number;
  message: string;
  correlationId?: string;
}

function toProblem(err: unknown): Problem {
  if (err instanceof ApiError) {
    return { status: err.status, message: err.message, correlationId: err.correlationId };
  }
  return { status: 0, message: String(err) };
}

function RestaurantImage({ src, name, cuisine }: { src: string; name: string; cuisine: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className="photo photo-fallback" aria-hidden="true">
        <span>{cuisine.charAt(0)}</span>
      </div>
    );
  }
  return <img className="photo" src={src} alt={name} onError={() => setFailed(true)} />;
}

function StatusLight({ label, port, state }: { label: string; port: number; state: Health }) {
  return (
    <span className={`light light-${state}`}>
      <span className="light-dot" />
      <span className="light-label">{label}</span>
      <span className="light-port">:{port}</span>
    </span>
  );
}

function App() {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [health, setHealth] = useState<{ restaurant: Health; order: Health }>({
    restaurant: 'checking',
    order: 'checking',
  });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRestaurants = useCallback(async () => {
    try {
      const data = await restaurantApi.list();
      setRestaurants(data.restaurants);
      setHealth((h) => ({ ...h, restaurant: 'ok' }));
    } catch {
      setHealth((h) => ({ ...h, restaurant: 'down' }));
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await orderApi.list();
      setOrders(data.orders.slice().reverse());
      setHealth((h) => ({ ...h, order: 'ok' }));
    } catch {
      setHealth((h) => ({ ...h, order: 'down' }));
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
      setProblem(null);
      setPlaced(null);
    } catch (err) {
      setProblem(toProblem(err));
    }
  };

  const addToCart = (item: MenuItem) => {
    setPlaced(null);
    setCart((prev) => {
      const existing = prev.find((line) => line.menu_item_id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.menu_item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price_cents: item.price_cents, quantity: 1 }];
    });
  };

  const changeQuantity = (menuItemId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => (line.menu_item_id === menuItemId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );
  };

  const submitOrder = async () => {
    if (!selected || cart.length === 0) return;
    setBusy(true);
    setProblem(null);
    setPlaced(null);
    try {
      const order = await orderApi.create(
        selected.id,
        cart.map((line) => ({ menu_item_id: line.menu_item_id, quantity: line.quantity })),
      );
      setPlaced(order);
      setCart([]);
      await loadOrders();
    } catch (err) {
      setProblem(toProblem(err));
    } finally {
      setBusy(false);
    }
  };

  const totalCents = cart.reduce((sum, line) => sum + line.price_cents * line.quantity, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const restaurantName = (id: number) => restaurants.find((r) => r.id === id)?.name ?? `Restaurant #${id}`;

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">F</span>
          <div>
            <h1>Foodapp</h1>
            <p>Order from the neighbourhood's kitchens</p>
          </div>
        </div>
        <div className="lights" aria-label="Service health">
          <StatusLight label="restaurant-service" port={8081} state={health.restaurant} />
          <StatusLight label="order-service" port={8082} state={health.order} />
        </div>
      </header>

      {problem && (
        <div className="notice notice-error" role="alert">
          <span className="code">{problem.status || 'NET'}</span>
          <div className="notice-text">
            <strong>{problem.status === 503 ? 'A service is unavailable' : 'The request was rejected'}</strong>
            <span>{problem.message}</span>
            {problem.correlationId && <span className="mono faint">trace {problem.correlationId}</span>}
          </div>
          <button className="notice-close" onClick={() => setProblem(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="board">
        <main className="main">
          <section>
            <div className="section-head">
              <h2>Restaurants</h2>
              <span className="count">{restaurants.length} open</span>
            </div>
            {restaurants.length === 0 ? (
              <div className="empty">
                {health.restaurant === 'down'
                  ? 'The Restaurant Service is not answering. Start it and this list refreshes on its own.'
                  : 'Loading restaurants…'}
              </div>
            ) : (
              <div className="grid">
                {restaurants.map((r) => (
                  <button
                    key={r.id}
                    className={`venue ${selected?.id === r.id ? 'venue-active' : ''}`}
                    onClick={() => void openRestaurant(r.id)}
                  >
                    <RestaurantImage src={r.image_url} name={r.name} cuisine={r.cuisine} />
                    <div className="venue-body">
                      <div className="venue-top">
                        <span className="tag">{r.cuisine}</span>
                        <span className="rating">★ {r.rating.toFixed(1)}</span>
                      </div>
                      <strong className="venue-name">{r.name}</strong>
                      <span className="faint">{r.address}</span>
                      <span className="faint">{r.item_count} dishes</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2>{selected ? selected.name : 'Menu'}</h2>
              {selected && <span className="count">{selected.items.length} dishes</span>}
            </div>
            {!selected ? (
              <div className="empty">Choose a restaurant above to see its menu.</div>
            ) : (
              <ul className="menu">
                {selected.items.map((item) => (
                  <li key={item.id} className={item.available ? '' : 'dish-out'}>
                    <div className="dish">
                      <div className="dish-line">
                        <strong>{item.name}</strong>
                        <span className="leader" aria-hidden="true" />
                        <span className="price">{formatMoney(item.price_cents, item.currency)}</span>
                      </div>
                      <span className="faint">{item.description}</span>
                    </div>
                    <button className="btn btn-add" disabled={!item.available} onClick={() => addToCart(item)}>
                      {item.available ? 'Add' : 'Sold out'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="side">
          <section className="ticket">
            <div className="ticket-head">
              <h2>Your order</h2>
              <span className="faint">{selected ? selected.name : 'No restaurant chosen'}</span>
            </div>

            {placed ? (
              <div className="placed">
                <span className="placed-check" aria-hidden="true">✓</span>
                <strong>Order confirmed</strong>
                <span className="mono">{placed.order_id}</span>
                <span className="faint">
                  {formatMoney(placed.total_cents, placed.currency)} · {placed.status}
                </span>
              </div>
            ) : cart.length === 0 ? (
              <p className="ticket-empty">Nothing here yet. Add dishes from the menu.</p>
            ) : (
              <ul className="lines">
                {cart.map((line) => (
                  <li key={line.menu_item_id}>
                    <span className="line-name">{line.name}</span>
                    <span className="stepper">
                      <button onClick={() => changeQuantity(line.menu_item_id, -1)} aria-label="Less">
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button onClick={() => changeQuantity(line.menu_item_id, 1)} aria-label="More">
                        +
                      </button>
                    </span>
                    <span className="price">{formatMoney(line.price_cents * line.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="ticket-foot">
              <div className="total">
                <span>Total{itemCount > 0 ? ` · ${itemCount} item${itemCount > 1 ? 's' : ''}` : ''}</span>
                <strong>{formatMoney(totalCents)}</strong>
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || cart.length === 0}
                onClick={() => void submitOrder()}
              >
                {busy ? 'Placing order…' : 'Place order'}
              </button>
            </div>
          </section>

          <section>
            <div className="section-head">
              <h2>Recent orders</h2>
              <span className="count">{orders.length}</span>
            </div>
            {orders.length === 0 ? (
              <div className="empty">
                {health.order === 'down' ? 'The Order Service is not answering.' : 'No orders yet.'}
              </div>
            ) : (
              <ul className="receipts">
                {orders.map((order) => (
                  <li key={order.order_id} className="receipt">
                    <div className="receipt-top">
                      <strong>{restaurantName(order.restaurant_id)}</strong>
                      <span className="pill">{order.status}</span>
                    </div>
                    <div className="receipt-items">
                      {order.items.map((i) => (
                        <span key={i.menu_item_id}>
                          {i.quantity}× {i.name}
                        </span>
                      ))}
                    </div>
                    <div className="receipt-total">
                      <span className="faint">{new Date(order.created_at).toLocaleTimeString()}</span>
                      <strong>{formatMoney(order.total_cents, order.currency)}</strong>
                    </div>
                    <div className="mono faint">{order.order_id}</div>
                    <div className="mono faint">trace {order.correlation_id}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default App;
