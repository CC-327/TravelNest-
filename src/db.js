import { openDB } from 'idb'

const dbPromise = openDB('travelnest-db', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('diaries', { keyPath: 'id', autoIncrement: true })
    }
    if (!db.objectStoreNames.contains('markers')) {
      const store = db.createObjectStore('markers', { keyPath: 'id' })
      store.createIndex('timestamp', 'timestamp')
    }
    if (!db.objectStoreNames.contains('media')) {
      db.createObjectStore('media', { keyPath: 'id' })
    }
  }
})

// ---------- 标记操作 ----------
export async function addMarker(marker) {
  const db = await dbPromise
  return db.add('markers', marker)
}

export async function getAllMarkers() {
  const db = await dbPromise
  return db.getAll('markers')
}

export async function updateMarker(id, changes) {
  const db = await dbPromise
  const tx = db.transaction('markers', 'readwrite')
  const store = tx.objectStore('markers')
  const marker = await store.get(id)
  if (!marker) return
  Object.assign(marker, changes)
  await store.put(marker)
  await tx.done
}

export async function deleteMarker(id) {
  const db = await dbPromise
  await db.delete('markers', id)
}

// ---------- 媒体操作 ----------
export async function saveMedia(blob, type, name) {
  const db = await dbPromise
  const id = crypto.randomUUID()
  await db.add('media', { id, blob, type, name })
  return id
}

export async function getMedia(id) {
  const db = await dbPromise
  return db.get('media', id)
}

export async function deleteMedia(id) {
  const db = await dbPromise
  await db.delete('media', id)
}

// 旧接口保留（不影响新功能）
export async function addDiary(diary) {
  const db = await dbPromise
  return db.add('diaries', diary)
}

export async function getAllDiaries() {
  const db = await dbPromise
  return db.getAll('diaries')
}