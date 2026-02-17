# React — ELI5 Quick Reference

## Components
A component is a reusable chunk of UI — like a cookie cutter. You define the shape once (`RouteCard`, `Button`, `LoginScreen`), then stamp out as many copies as you need with different data. Every piece of visible UI in the app is a component, and components nest inside each other like Russian dolls: a `Screen` contains a `List`, which contains `Card`s, which contain `Text` and `Button`s.

```tsx
function RouteCard({ name, grade }) {
  return <Text>{name} — {grade}</Text>;
}
```

## Props
Props are the inputs you pass to a component — like arguments to a function. A parent hands data *down* to a child via props. Props are **read-only**: the child can look at them but can't change them. If the parent passes new props, the child re-renders with the new values.

```tsx
<RouteCard name="Crimson Overhang" grade="V5" />
```

## State (`useState`)
State is a component's personal memory. Unlike props (which come from a parent), state lives *inside* the component and it can change over time. When state changes, React automatically re-renders that component to reflect the new value. Think of it like a whiteboard in a room — anyone in the room can erase and rewrite it, and the room updates accordingly.

```tsx
const [count, setCount] = useState(0);
// count = current value, setCount = function to change it
```

## Hooks
Hooks are special functions (always start with `use`) that let components tap into React features. They're the bridge between your component and React's engine. You can only call them at the top level of a component — never inside loops or `if` blocks. React tracks hooks by their call order, so the order must stay the same every render.

The most common built-in hooks:
- **`useState`** — gives the component memory
- **`useEffect`** — runs code when something changes (fetching data, subscriptions, timers)
- **`useRef`** — holds a mutable value that *doesn't* trigger re-renders (like a sticky note React ignores)
- **`useMemo`** — caches an expensive calculation so it doesn't re-run every render
- **`useCallback`** — caches a function reference so child components don't re-render unnecessarily

## Effects (`useEffect`)
An effect is code that runs *after* the component renders — side effects like fetching data, starting a timer, or subscribing to events. You give it a **dependency array**: React re-runs the effect only when those values change. An empty array `[]` means "run once on mount." No array means "run after every render" (usually a mistake).

```tsx
useEffect(() => {
  fetchRoutes();          // runs when gymId changes
  return () => cleanup(); // runs when component unmounts or before re-running
}, [gymId]);
```

## Re-rendering
When state or props change, React re-renders that component (calls the function again). It then compares the new output with the old output and only updates the parts of the screen that actually changed. This diffing process is why React is fast — it doesn't rebuild the whole UI, just the bits that are different. Like editing a Google Doc: only the changed paragraph re-syncs, not the whole document.

## JSX
JSX is the HTML-looking syntax inside JavaScript. It's not actually HTML — Babel transforms it into function calls. `<View>` becomes `React.createElement(View, ...)`. In React Native, you use `<View>` instead of `<div>`, `<Text>` instead of `<span>`, and `<Pressable>` instead of `<button>`. Curly braces `{}` let you embed JavaScript expressions inside JSX.

```tsx
<View>
  <Text>Hello {user.name}</Text>
  {isLoggedIn && <LogoutButton />}
</View>
```

## Context
Context is React's way of passing data through the component tree without manually threading props through every level. Think of it like a radio station: one component broadcasts a value, and any descendant can tune in. Useful for app-wide stuff like the current user, theme, or language. In Beta Breaker we mostly use Zustand instead of Context for client state, and TanStack Query for server state — both solve the same "how do distant components share data" problem more cleanly.

## Keys
When rendering a list, React needs a unique `key` on each item so it can track which items changed, were added, or removed. Without keys, React re-renders the entire list. With keys, it only updates the items that actually changed. Always use a stable identifier (like `route.id`), never the array index — index keys break when items are reordered or deleted.

```tsx
{routes.map(route => (
  <RouteCard key={route.id} name={route.name} />
))}
```

## Children
`children` is a special prop — it's whatever you put *between* a component's opening and closing tags. This lets you create wrapper components that don't need to know what's inside them.

```tsx
function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

// Usage: Card doesn't care what's inside it
<Card>
  <Text>Anything goes here</Text>
</Card>
```

## Conditional Rendering
React doesn't have `if` in JSX, so you use JavaScript expressions:
- **`&&`** — render something or nothing: `{isAdmin && <AdminPanel />}`
- **ternary** — render one thing or another: `{loading ? <Spinner /> : <Content />}`
- **early return** — bail out of the whole component: `if (!user) return null;`

## Custom Hooks
A custom hook is just a function that uses other hooks. It lets you extract reusable logic out of components. The convention is to name them `useXxx`. The component calls the hook and gets back whatever it returns — data, functions, loading states. The hook handles the *how*, the component handles the *what to show*.

```tsx
// Custom hook — lives in hooks/
function useRoutes(gymId) {
  return useQuery({
    queryKey: ['routes', gymId],
    queryFn: () => routesService.getByGym(gymId),
  });
}

// Component — just consumes the hook
function RouteList({ gymId }) {
  const { data, isLoading } = useRoutes(gymId);
  if (isLoading) return <Spinner />;
  return data.map(r => <RouteCard key={r.id} route={r} />);
}
```
