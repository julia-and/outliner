# Bug: `useDocument` releases Y.Doc prematurely, destroying persistence

**Package:** `dexie-react-hooks`
**Versions tested:** `dexie-react-hooks@4.2.0`, `y-dexie@4.2.2`, `dexie@4.3.0`, `dexie-cloud-addon@4.3.9`
**React version:** 19.2.3 (also likely affects React 18)

---

## Summary

`useDocument` destroys the Y.Doc ~100ms after the component first loads, silently unregistering the y-dexie persistence listener (`onUpdate`). After destruction, in-memory Y.Doc mutations (typing, etc.) continue to work — the UI updates normally — but **nothing is written to IndexedDB**. Data is lost on hard refresh.

---

## Observed Behaviour

1. Component mounts, `DexieYProvider.load(doc)` is called → `refCount = 1`
2. ~100ms later the grace timer fires, `doc.destroy()` is called
3. All subsequent mutations update Y.Doc state in memory but produce **zero IDB writes**
4. Hard refresh loses all data written since mount

Confirmed via `WeakMap.prototype.set` instrumentation and `IDBObjectStore.prototype.add` patching:

```
+36ms   LOAD  <outline-doc-id>   refCount: 1
+45ms   LOAD  <nodeContents-id>  refCount: 1
+142ms  grace timer (100ms) fires  ← refCount should still be 1!
+143ms  Y.Doc <outline-doc-id> was destroyed
+147ms  Y.Doc <nodeContents-id> was destroyed
```

---

## Root Cause

### The effect re-runs when only `unregisterToken` changes

`useDocument` calls `DexieYProvider.load(doc)` **during render** (not in an effect), then registers a `useEffect` cleanup that calls `DexieYProvider.release(doc)`. The effect's dependency array is `[doc, unregisterToken]`.

```js
// dexie-react-hooks/dist/dexie-react-hooks.js

var unregisterToken = undefined;
if (doc) {
  if (doc !== providerRef.current?.doc) {
    providerRef.current = DexieYProvider.load(doc, { gracePeriod: gracePeriod });
    unregisterToken = Object.create(null);          // ← new object every time doc changes
    fr.register(providerRef, doc, unregisterToken);
  }
}

useEffect(function () {
  if (doc) {
    if (unregisterToken) fr.unregister(unregisterToken);
    var provider = DexieYProvider.for(doc);
    if (provider) {
      return function () {
        DexieYProvider.release(doc);               // ← cleanup
      };
    }
  }
}, [doc, unregisterToken]);                        // ← both deps
```

### The failing sequence

Consider a component that:
1. First renders with `doc = undefined` (data not yet loaded)
2. Re-renders when data loads: `doc = Y.Doc_A` → `doc !== null?.doc` → **load called**, `unregisterToken = {}` (call it `token_B`)
3. Re-renders again (e.g., because `setLoaded(true)` triggers a state update): `doc = Y.Doc_A` still, but now `doc === providerRef.current?.doc` (because `providerRef` was mutated during render 2) → **no load called**, `unregisterToken = undefined`

Effect deps change from `[Y.Doc_A, token_B]` to `[Y.Doc_A, undefined]`, so React runs the cleanup from render 2:

```
DexieYProvider.release(Y.Doc_A)   ← refCount 1 → 0 → 100ms grace timer starts
```

The new effect runs with `unregisterToken = undefined`, so it **does not call load again**. It just registers a new cleanup. After 100ms the grace timer fires and calls `_release()` → `doc.destroy()`.

### Net result: 1 load, 2 releases (one unmatched)

| Render | `doc !== ref?.doc` | load called | unregisterToken | Effect cleanup calls release |
|--------|-------------------|-------------|-----------------|------------------------------|
| A (undefined) | — | no | undefined | no |
| B (Y.Doc_A) | **yes** | **yes** (+1) | `{}` | yes (-1) |
| C (Y.Doc_A, re-render) | no | no | undefined | yes (-1) ← **unmatched** |

The `unregisterToken` dependency causes an extra cleanup cycle that has no corresponding load.

### Why the re-render happens

In a typical Dexie pattern:

```tsx
const OutlineLoader = () => {
  const outline = useLiveQuery(() => db.outlines.get(id), [id])
  const provider = useDocument(outline?.content)   // ← render B: loads doc
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!provider) return
    provider.whenLoaded.then(() => setLoaded(true)) // ← triggers render C
  }, [provider])
  ...
}
```

`provider.whenLoaded` often resolves very quickly (the liveQuery fires synchronously-ish with existing data). `setLoaded(true)` causes render C before the effect from render B has had a chance to run. At render C, `providerRef.current.doc === doc` (because render B mutated the ref) → `unregisterToken = undefined` → effect re-runs with new deps → cleanup from render B fires `release(doc)` → grace timer → destroy.

---

## Minimal Reproduction

```tsx
import { useState, useEffect } from 'react'
import { useLiveQuery, useDocument } from 'dexie-react-hooks'
import { db } from './db' // Dexie db with y-dexie addon

function DocLoader({ id }: { id: string }) {
  // Step 1: useLiveQuery returns the row (triggers render B)
  const row = useLiveQuery(() => db.docs.get(id), [id])

  // Step 2: useDocument loads the Y.Doc in render B
  const provider = useDocument(row?.content)

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!provider) return
    // Step 3: whenLoaded resolves quickly → setLoaded(true) → render C
    // Render C: doc === providerRef.current?.doc → unregisterToken = undefined
    // Effect deps [doc, {}] → [doc, undefined]: cleanup fires, releases doc
    // 100ms later: grace timer destroys doc
    provider.whenLoaded.then(() => setLoaded(true))
  }, [provider])

  if (!loaded || !row) return <div>Loading...</div>

  return <Editor doc={row.content} /> // doc is destroyed by the time user types
}
```

**Reproduction steps:**

1. Use the pattern above with a table that has a Y.Doc property
2. Ensure the row already exists in IDB (so `useLiveQuery` resolves quickly)
3. Mount `DocLoader`
4. Type into the editor
5. Hard-refresh — all typed content is gone

**Console evidence:**
```
Y.Doc <id> was destroyed    ← appears ~100ms after mount
```

**IDB evidence:** `IDBObjectStore.add` is never called on the updates table during typing.

---

## Why it doesn't reproduce in all setups

- If `provider.whenLoaded` takes longer than the React paint cycle (e.g., large doc, slow device), render C may happen after effect B has already run, and the cleanup order is benign.
- In `npm run dev`, differences in timing or service worker state can mask the issue.
- The issue is deterministic with pre-existing IDB data (fast liveQuery + fast whenLoaded).

---

## Workaround

Replace `useDocument` with a direct effect that pairs `load` and `release` without the `unregisterToken` dependency:

```tsx
import { DexieYProvider } from 'y-dexie'

const row = useLiveQuery(() => db.docs.get(id), [id])
const doc = row?.content         // stable reference from y-dexie docCache
const [loaded, setLoaded] = useState(false)

useEffect(() => {
  if (!doc) { setLoaded(false); return }
  const provider = DexieYProvider.load(doc, { gracePeriod: 1000 })
  let active = true
  provider.whenLoaded.then(() => { if (active) setLoaded(true) })
  return () => {
    active = false
    setLoaded(false)
    DexieYProvider.release(doc)
  }
}, [doc])   // ← only re-runs when the doc itself changes
```

This ensures exactly one `release` per `load`, keyed on the Y.Doc's identity (which is stable across re-renders via y-dexie's `docCache`).

---

## Suggested Fix in `useDocument`

The core issue is that `unregisterToken` should not be in the effect dependency array. Its only purpose is to tell the effect whether to call `fr.unregister()`, not to control when `release` is called.

**Option A:** Remove `unregisterToken` from deps, pass it via a ref:

```js
const unregisterTokenRef = useRef(undefined);
if (doc && doc !== providerRef.current?.doc) {
  providerRef.current = DexieYProvider.load(doc, { gracePeriod });
  unregisterTokenRef.current = Object.create(null);
  fr.register(providerRef, doc, unregisterTokenRef.current);
}

useEffect(() => {
  if (doc) {
    if (unregisterTokenRef.current) {
      fr.unregister(unregisterTokenRef.current);
      unregisterTokenRef.current = undefined;
    }
    const provider = DexieYProvider.for(doc);
    if (provider) {
      return () => DexieYProvider.release(doc);
    }
  }
}, [doc]);   // ← unregisterToken removed from deps
```

**Option B:** Move `DexieYProvider.load` into the effect, not the render. This removes the need for `FinalizationRegistry` as a fallback and makes load/release unconditionally paired:

```js
useEffect(() => {
  if (!doc) return;
  const provider = DexieYProvider.load(doc, { gracePeriod });
  providerRef.current = provider;
  return () => {
    DexieYProvider.release(doc);
    providerRef.current = null;
  };
}, [doc]);
```

(The `FinalizationRegistry` fallback could be dropped since load/release are now effect-paired and React guarantees cleanup runs before unmount.)
