<template>
  <div class="date-picker">
    <!-- 年份滚轮 -->
    <div class="wheel-container">
      <div class="wheel-mask top"></div>
      <div class="wheel-mask bottom"></div>
      <div class="wheel-strip"></div>
      <div class="wheel" ref="yearWheel" @scroll="onYearScroll">
        <div
          v-for="y in years"
          :key="y"
          class="wheel-item"
          :class="{ active: y === selected.year }"
          :ref="el => setItemRef('year', y, el)"
        >{{ y }}</div>
      </div>
    </div>

    <!-- 月份滚轮 -->
    <div class="wheel-container">
      <div class="wheel-mask top"></div>
      <div class="wheel-mask bottom"></div>
      <div class="wheel-strip"></div>
      <div class="wheel" ref="monthWheel" @scroll="onMonthScroll">
        <div
          v-for="m in 12"
          :key="m"
          class="wheel-item"
          :class="{ active: m === selected.month }"
          :ref="el => setItemRef('month', m, el)"
        >{{ m }}月</div>
      </div>
    </div>

    <!-- 日期滚轮 -->
    <div class="wheel-container">
      <div class="wheel-mask top"></div>
      <div class="wheel-mask bottom"></div>
      <div class="wheel-strip"></div>
      <div class="wheel" ref="dayWheel" @scroll="onDayScroll">
        <div
          v-for="d in daysInMonth"
          :key="d"
          class="wheel-item"
          :class="{ active: d === selected.day }"
          :ref="el => setItemRef('day', d, el)"
        >{{ d }}日</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ year: 2025, month: 1, day: 1 }) }
})
const emit = defineEmits(['update:modelValue'])

const currentYear = new Date().getFullYear()
const years = []
for (let y = 2000; y <= currentYear; y++) years.push(y)

const selected = ref({ ...props.modelValue })
const yearWheel = ref(null)
const monthWheel = ref(null)
const dayWheel = ref(null)

// 存储所有滚轮项的 DOM 引用
const itemRefs = ref({ year: {}, month: {}, day: {} })

function setItemRef(type, value, el) {
  if (el) itemRefs.value[type][value] = el
}

const daysInMonth = computed(() => {
  const y = selected.value.year
  const m = selected.value.month
  if ([1,3,5,7,8,10,12].includes(m)) return 31
  if ([4,6,9,11].includes(m)) return 30
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0) ? 29 : 28
})

watch([() => selected.value.year, () => selected.value.month], () => {
  if (selected.value.day > daysInMonth.value) {
    selected.value.day = daysInMonth.value
    emitUpdate()
  }
})

function emitUpdate() {
  emit('update:modelValue', { ...selected.value })
}

let yearTimer, monthTimer, dayTimer

function onYearScroll() {
  clearTimeout(yearTimer)
  yearTimer = setTimeout(() => {
    const idx = getClosestIndex('year')
    if (idx >= 0 && idx < years.length) {
      selected.value.year = years[idx]
      emitUpdate()
    }
  }, 80)
}

function onMonthScroll() {
  clearTimeout(monthTimer)
  monthTimer = setTimeout(() => {
    const idx = getClosestIndex('month')
    if (idx >= 0 && idx < 12) {
      selected.value.month = idx + 1
      emitUpdate()
    }
  }, 80)
}

function onDayScroll() {
  clearTimeout(dayTimer)
  dayTimer = setTimeout(() => {
    const idx = getClosestIndex('day')
    if (idx >= 0 && idx < daysInMonth.value) {
      selected.value.day = idx + 1
      emitUpdate()
    }
  }, 80)
}

function getClosestIndex(type) {
  const wheel = type === 'year' ? yearWheel.value :
               type === 'month' ? monthWheel.value : dayWheel.value
  if (!wheel) return 0
  const items = Object.values(itemRefs.value[type]).filter(Boolean)
  if (items.length === 0) return 0
  const center = wheel.scrollTop + wheel.clientHeight / 2
  let closest = 0, minDist = Infinity
  items.forEach((el, i) => {
    const dist = Math.abs(el.offsetTop + el.clientHeight / 2 - center)
    if (dist < minDist) { minDist = dist; closest = i }
  })
  return closest
}

async function scrollToSelected() {
  await nextTick()
  const scrollTo = (wheel, refs, key) => {
    const el = refs[key]
    if (wheel && el) {
      wheel.scrollTop = el.offsetTop - wheel.clientHeight / 2 + el.clientHeight / 2
    }
  }
  scrollTo(yearWheel.value, itemRefs.value.year, selected.value.year)
  scrollTo(monthWheel.value, itemRefs.value.month, selected.value.month)
  scrollTo(dayWheel.value, itemRefs.value.day, selected.value.day)
}

onMounted(scrollToSelected)

watch(() => props.modelValue, async (v) => {
  if (v) {
    selected.value = { ...v }
    await nextTick()
    scrollToSelected()
  }
}, { deep: true })
</script>

<style scoped>
.date-picker { display: flex; justify-content: center; gap: 12px; padding: 8px 0; }
.wheel-container { position: relative; width: 80px; height: 180px; overflow: hidden; }
.wheel-strip {
  position: absolute; top: 50%; left: 8px; right: 8px; height: 36px;
  transform: translateY(-50%); border-top: 1px solid #42b983;
  border-bottom: 1px solid #42b983; background: rgba(66,185,131,0.08);
  border-radius: 4px; pointer-events: none; z-index: 1;
}
.wheel-mask { position: absolute; left: 0; right: 0; height: 60px; pointer-events: none; z-index: 2; }
.wheel-mask.top { top: 0; background: linear-gradient(to bottom, white 30%, transparent); }
.wheel-mask.bottom { bottom: 0; background: linear-gradient(to top, white 30%, transparent); }
.wheel { height: 100%; overflow-y: scroll; padding: 72px 0; scroll-behavior: auto; }
.wheel::-webkit-scrollbar { display: none; }
.wheel-item {
  height: 36px; line-height: 36px; text-align: center; font-size: 16px;
  color: #999; scroll-snap-align: center; user-select: none; transition: color 0.2s;
}
.wheel-item.active { color: #333; font-weight: 600; }
</style>