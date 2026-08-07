<template>
  <div id="map-wrapper">
    <div id="map" ref="mapDiv"></div>

    <!-- ========== 日记弹窗（新建 / 编辑共用） ========== -->
    <div
      v-if="showForm"
      class="diary-form"
      :style="{ left: formX + 'px', top: formY + 'px' }"
    >
      <!-- 标题栏（可拖动） -->
      <div class="form-header" @mousedown="startDrag" @touchstart.prevent="startDragTouch">
        <span>{{ editingId ? '✏️ 编辑记录' : '📍 记录这个地点' }}</span>
        <button class="btn-close" @click="closeForm">✕</button>
      </div>

      <div class="form-body" @mousedown.stop @touchstart.stop>
        <!-- 地点名称 -->
        <label class="label">地点</label>
        <input v-model="form.name" placeholder="地点名称" />

        <!-- 日期选择（年/月/日下拉框） -->
        <label class="label">日期</label>
        <div class="date-selects">
          <select v-model.number="form.year">
            <option v-for="y in yearRange" :key="y" :value="y">{{ y }}</option>
          </select> 年
          <select v-model.number="form.month">
            <option v-for="m in 12" :key="m" :value="m">{{ m }}</option>
          </select> 月
          <select v-model.number="form.day">
            <option v-for="d in maxDay" :key="d" :value="d">{{ d }}</option>
          </select> 日
        </div>
        <p class="hint" v-if="dayOverflow">⚠ 该月没有 {{ overflowDay }} 天，已自动调整</p>

        <!-- 日记内容 -->
        <label class="label">日记内容</label>
        <textarea v-model="form.diary" placeholder="写几句当时的感受..." rows="4"></textarea>

        <!-- 照片/视频上传 -->
        <label class="label">照片 / 视频</label>
        <div class="media-section">
          <div class="media-preview" v-for="(item, i) in form.mediaList" :key="i">
            <img v-if="item.type.startsWith('image')" :src="item.url" class="thumb" />
            <video v-else :src="item.url" class="thumb" controls></video>
            <button class="btn-remove-media" @click="removeMedia(i)">✕</button>
          </div>
          <label class="btn-upload">
            + 添加
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              @change="onFilesSelected"
            />
          </label>
        </div>

        <!-- 按钮组 -->
        <div class="btn-group">
          <button v-if="editingId" class="btn-delete" @click="deleteCurrentMarker">删除</button>
          <button class="btn-save" @click="saveMarker">保存</button>
          <button class="btn-cancel" @click="closeForm">取消</button>
        </div>
      </div>
    </div>

    <!-- ========== 查看详情卡片 ========== -->
    <div
      v-if="showDetail"
      class="diary-detail"
      :style="{ left: detailX + 'px', top: detailY + 'px' }"
    >
      <div class="detail-header" @mousedown="startDragDetail" @touchstart.prevent="startDragDetailTouch">
        <span>{{ detailMarker?.name }}</span>
        <div>
          <button class="btn-edit-detail" @click="editCurrentMarker">✏️</button>
          <button class="btn-close-detail" @click="showDetail = false">✕</button>
        </div>
      </div>
      <div class="detail-body">
        <p class="detail-date" v-if="detailMarker?.travelDate">
          🗓️ {{ detailMarker.travelDate.year }}/{{ detailMarker.travelDate.month }}/{{ detailMarker.travelDate.day }}
        </p>
        <p class="detail-text">{{ detailMarker?.diary || '暂无日记内容' }}</p>
        <div class="detail-media" v-if="detailMarker?.mediaIds?.length">
          <div v-for="(mid, i) in detailMarker.mediaIds" :key="i">
            <img v-if="detailMediaUrls[i]?.type?.startsWith('image')" :src="detailMediaUrls[i]?.url" class="thumb-large" />
            <video v-else-if="detailMediaUrls[i]?.type?.startsWith('video')" :src="detailMediaUrls[i]?.url" controls class="thumb-large"></video>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { addMarker, getAllMarkers, updateMarker, deleteMarker, saveMedia, getMedia, deleteMedia } from '../db.js'

// ==================== 地图相关 ====================
const mapDiv = ref(null)
let map = null
let currentLnglat = null

// ==================== 表单状态 ====================
const showForm = ref(false)
const editingId = ref(null)
const form = ref({
  name: '',
  diary: '',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  day: new Date().getDate(),
  mediaList: [],
  mediaIds: []
})

// 年份范围 2000～今年
const yearRange = []
for (let y = 2000; y <= new Date().getFullYear(); y++) yearRange.push(y)

// 计算当月最大天数（含闰年）
const daysInMonth = computed(() => {
  const y = form.value.year, m = form.value.month
  if ([1,3,5,7,8,10,12].includes(m)) return 31
  if ([4,6,9,11].includes(m)) return 30
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0) ? 29 : 28
})

const overflowDay = ref(form.value.day)
watch([()=>form.value.year,()=>form.value.month],()=>{
  if(form.value.day > daysInMonth.value){
    overflowDay.value = form.value.day
    form.value.day = daysInMonth.value
  }
})
const dayOverflow = computed(() => form.value.day > daysInMonth.value)
const maxDay = computed(() => daysInMonth.value)

// ==================== 详情卡片状态 ====================
const showDetail = ref(false)
const detailMarker = ref(null)
const detailMediaUrls = ref([])

// ==================== 弹窗位置 ====================
const formX = ref(0)
const formY = ref(0)
const detailX = ref(0)
const detailY = ref(0)

// ==================== 拖动相关 ====================
let dragging = false, dragTarget = ''
let dragStartX = 0, dragStartY = 0, dragStartFormX = 0, dragStartFormY = 0

// ==================== 初始化地图：加大地图标签字号 ====================
onMounted(async () => {
  const AMapLoader = await import('@amap/amap-jsapi-loader')
  const AMap = await AMapLoader.default.load({
    key: '23392628b7920209fc29e79a92011a4f',
    version: '2.0',
    plugins: []
  })

  map = new AMap.Map(mapDiv.value, {
    zoom: 11,
    center: [116.397428, 39.90923],
    viewMode: '2D',
    showLabel: true,
    mapStyle: 'amap://styles/normal',
    resizeEnable:true,
    labelZIndex:120
  })
  // 全要素打开 + 全局地名放大
  map.setFeatures(['bg','road','building','point','boundary'])
  map.setMapStyle('amap://styles/normal')

  // 右键 / 长按 → 打开新建表单
  map.on('rightclick', (e) => {
    const pixel = map.lnglatToPixel(e.lnglat, map.getZoom())
    openCreateForm(pixel, e.lnglat)
  })
  map.on('longpress', (e) => {
    const pixel = map.lnglatToPixel(e.lnglat, map.getZoom())
    openCreateForm(pixel, e.lnglat)
  })

  const markers = await getAllMarkers()
  markers.forEach(addMarkerToMap)
})

// ==================== 新建标记表单 ====================
function openCreateForm(pixel, lnglat) {
  currentLnglat = lnglat
  editingId.value = null
  form.value = {
    name: '',
    diary: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    mediaList: [],
    mediaIds: []
  }
  setPosition(pixel.x, pixel.y, 'form')
  showDetail.value = false
  showForm.value = true
}

// ==================== 在地图上添加标记 ====================
function addMarkerToMap(data) {
  const marker = new AMap.Marker({
    position: [data.lng, data.lat],
    title: data.name
  })

  marker.on('click', async () => {
    currentLnglat = { lng: data.lng, lat: data.lat }
    detailMarker.value = data
    detailMediaUrls.value = []
    if (data.mediaIds) {
      for (const mid of data.mediaIds) {
        const media = await getMedia(mid)
        if (media) {
          const url = URL.createObjectURL(media.blob)
          detailMediaUrls.value.push({ url, type: media.type })
        }
      }
    }
    const pixel = map.lnglatToPixel([data.lng, data.lat], map.getZoom())
    setPosition(pixel.x, pixel.y, 'detail')
    showForm.value = false
    showDetail.value = true
  })
  map.add(marker)
  data._marker = marker
}

// ==================== 编辑已有标记 ====================
async function editCurrentMarker() {
  const d = detailMarker.value
  if (!d) return
  editingId.value = d.id
  form.value = {
    name: d.name,
    diary: d.diary,
    year: d.travelDate?.year || new Date().getFullYear(),
    month: d.travelDate?.month || 1,
    day: d.travelDate?.day || 1,
    mediaList: [],
    mediaIds: d.mediaIds || []
  }
  for (const mid of form.value.mediaIds) {
    const media = await getMedia(mid)
    if (media) {
      const url = URL.createObjectURL(media.blob)
      form.value.mediaList.push({ file: null, url, type: media.type, id: mid })
    }
  }
  showDetail.value = false
  formX.value = detailX.value
  formY.value = detailY.value
  showForm.value = true
}

// ==================== 保存标记 ====================
async function saveMarker() {
  if (!form.value.name.trim()) return
  const newMediaIds = []
  for (const item of form.value.mediaList) {
    if (item.file) {
      const id = await saveMedia(item.file, item.file.type, item.file.name)
      newMediaIds.push(id)
    } else if (item.id) {
      newMediaIds.push(item.id)
    }
  }
  const markerData = {
    lng: currentLnglat.lng,
    lat: currentLnglat.lat,
    name: form.value.name.trim(),
    diary: form.value.diary.trim(),
    travelDate: { year: form.value.year, month: form.value.month, day: form.value.day },
    timestamp: Date.now(),
    visitCount: editingId.value ? (detailMarker.value?.visitCount || 1) : 1,
    mediaIds: newMediaIds
  }
  if (editingId.value) {
    const oldMarker = detailMarker.value?._marker
    if (oldMarker) map.remove(oldMarker)
    await updateMarker(editingId.value, markerData)
    markerData.id = editingId.value
    addMarkerToMap(markerData)
  } else {
    markerData.id = crypto.randomUUID()
    await addMarker(markerData)
    addMarkerToMap(markerData)
  }
  closeForm()
}

// ==================== 删除标记 ====================
async function deleteCurrentMarker() {
  if (!editingId.value) return
  if (!confirm('确定删除这条记录吗？')) return
  const marker = detailMarker.value
  if (marker?.mediaIds) {
    for (const mid of marker.mediaIds) await deleteMedia(mid)
  }
  const oldMarker = marker?._marker
  if (oldMarker) map.remove(oldMarker)
  await deleteMarker(editingId.value)
  closeForm()
  showDetail.value = false
}

// ==================== 关闭表单 ====================
function closeForm() {
  showForm.value = false
  editingId.value = null
}

// ==================== 媒体处理 ====================
function onFilesSelected(e) {
  const files = Array.from(e.target.files)
  for (const file of files) {
    const url = URL.createObjectURL(file)
    form.value.mediaList.push({ file, url, type: file.type })
  }
  e.target.value = ''
}
function removeMedia(index) {
  const removed = form.value.mediaList.splice(index, 1)[0]
  if (removed?.url) URL.revokeObjectURL(removed.url)
}

// ==================== 弹窗定位防溢出 ====================
function setPosition(x, y, target) {
  const popupW = 380
  const popupH = 480
  const container = mapDiv.value
  if (!container) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  let left = x - popupW - 12
  let top = y - popupH / 2
  if(left < 12) left = x + 20
  if(top < 12) top = 12
  if(left + popupW > cw) left = cw - popupW - 12
  if(top + popupH > ch) top = ch - popupH - 12
  if (target === 'form') { formX.value = left; formY.value = top }
  else { detailX.value = left; detailY.value = top }
}

// ==================== 拖动 ====================
function startDrag(e) { if (e.button !== 0) return; dragBegin(e.clientX, e.clientY, 'form') }
function startDragDetail(e) { if (e.button !== 0) return; dragBegin(e.clientX, e.clientY, 'detail') }
function startDragTouch(e) { const t = e.touches[0]; dragBegin(t.clientX, t.clientY, 'form') }
function startDragDetailTouch(e) { const t = e.touches[0]; dragBegin(t.clientX, t.clientY, 'detail') }

function dragBegin(cx, cy, target) {
  dragging = true
  dragTarget = target
  dragStartX = cx
  dragStartY = cy
  dragStartFormX = target === 'form' ? formX.value : detailX.value
  dragStartFormY = target === 'form' ? formY.value : detailY.value
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('touchmove', onDragTouch, { passive: false })
  window.addEventListener('touchend', stopDragTouch)
}
function onDrag(e) { moveDrag(e.clientX, e.clientY) }
function onDragTouch(e) { moveDrag(e.touches[0].clientX, e.touches[0].clientY) }
function moveDrag(cx, cy) {
  if (!dragging) return
  const dx = cx - dragStartX, dy = cy - dragStartY
  if (dragTarget === 'form') { formX.value = dragStartFormX + dx; formY.value = dragStartFormY + dy }
  else { detailX.value = dragStartFormX + dx; detailY.value = dragStartFormY + dy }
}
function stopDrag() { dragging = false; cleanupDrag() }
function stopDragTouch() { dragging = false; cleanupDrag() }
function cleanupDrag() {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('touchmove', onDragTouch)
  window.removeEventListener('touchend', stopDragTouch)
}
onUnmounted(cleanupDrag)
</script>

<style scoped>
#map-wrapper { position: relative; width: 100%; height: 100%; }
#map { width: 100%; height: 100%; }

.diary-form, .diary-detail {
  position: absolute;
  width: 380px;
  max-height: 80vh;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.25);
  z-index: 100;
  display: flex;
  flex-direction: column;
  user-select: none;
  overflow: hidden;
}

.form-header, .detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #42b983;
  color: white;
  border-radius: 12px 12px 0 0;
  cursor: move;
  font-weight: 600;
  font-size: 20px; /* 标题加大 */
  flex-shrink: 0;
}
.detail-header { background: #3a7bd5; }
.btn-close, .btn-close-detail, .btn-edit-detail {
  background: none; border: none; color: white; font-size:24px; cursor: pointer; padding: 0 4px;
}
.btn-edit-detail { font-size:22px; margin-right: 8px; }

.form-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  font-size:18px; /* 表单正文放大 */
}
.form-body .label {
  display: block;
  font-size:16px;
  color: #555;
  margin: 14px 0 6px;
}
.form-body input, .form-body textarea, .form-body select {
  width: 100%;
  padding:11px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size:18px;
  box-sizing: border-box;
}
.form-body textarea { min-height: 90px; resize: vertical; }

.date-selects { display: flex; gap: 6px; align-items: center; font-size:18px; }
.date-selects select { width: auto; flex: 1; }
.hint { font-size:15px; color: #e67e22; margin: 4px 0 0; }

.media-section { display: flex; flex-wrap: wrap; gap: 8px; }
.thumb { width: 96px; height: 96px; object-fit: cover; border-radius: 6px; border: 1px solid #eee; }
.thumb-large { max-width: 100%; max-height: 300px; border-radius: 6px; margin: 8px 0; display: block; }
.media-preview { position: relative; }
.btn-remove-media {
  position: absolute; top: -6px; right: -6px;
  width: 24px; height: 24px; border-radius: 50%;
  background: #f44; color: white; border: none; font-size:16px; cursor: pointer; line-height:24px; text-align: center;
}
.btn-upload {
  width: 96px; height: 96px; border: 2px dashed #ddd; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: #777; font-size:16px; cursor: pointer;
}

.btn-group { display: flex; gap: 8px; margin-top:14px; }
.btn-group button { flex: 1; padding:13px; border: none; border-radius: 6px; font-size:18px; cursor: pointer; }
.btn-save { background: #42b983; color: white; }
.btn-cancel { background: #eee; color: #333; }
.btn-delete { background: #e74c3c; color: white; flex: 0.5; }

.detail-body { padding: 16px; overflow-y: auto; font-size:18px; }
.detail-date { font-size:17px; color: #42b983; margin-bottom: 10px; }
.detail-text { font-size:18px; line-height: 1.7; white-space: pre-wrap; }

@media (max-width: 600px) {
  .diary-form, .diary-detail {
    width: 90vw !important;
    left: 5vw !important;
    max-height: 70vh;
  }
}
</style>