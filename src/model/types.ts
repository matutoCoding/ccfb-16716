// 领域模型：整个系统的数据契约

export type ID = string

// 蛋糕胚形状
export type LayerShape = 'round' | 'square' | 'heart'

// 材质类型：奶油 / 翻糖 / 镜面淋面
export type MaterialKind = 'cream' | 'fondant' | 'glaze'

// 花嘴截面形状
export type NozzleProfile = 'round' | 'star' | 'shell' | 'leaf' | 'petal' | 'rope'

// 挤花绘制面：顶面 / 侧面环带
export type DrawSurface = 'top' | 'side'

// 装饰件类型
export type DecorationKind =
  | 'fruit_strawberry'
  | 'fruit_blueberry'
  | 'chocolate_shard'
  | 'sugar_pearl'
  | 'number_candle'

// 灯光场景
export type LightingScene = 'shop' | 'wedding'

export interface RGB {
  r: number
  g: number
  b: number
}

// 蛋糕胚层：从下往上堆叠，yBottom 由下方各层高度累加得到（运行时计算）
export interface CakeLayer {
  id: ID
  shape: LayerShape
  // 直径（圆/心形）或边长（方形），单位 cm
  diameter: number
  // 层高度，单位 cm
  height: number
  material: MaterialKind
  color: RGB
  // 淋面专属：滴落长度比例 0~1（相对层高），无淋面时为 0
  dripRatio: number
}

// 挤花路径上的一个采样点：路径坐标 + 该点半径（cm）+ 压力 0~1
export interface PathPoint {
  x: number
  y: number
  z: number
  radius: number
  pressure: number
}

// 一条挤花路径 = 一次连续挤奶油动作
export interface PipingPath {
  id: ID
  layerId: ID
  surface: DrawSurface
  nozzle: NozzleProfile
  // 花嘴编号（制作单展示用，如 1M / 2D / 12 号圆口）
  nozzleCode: string
  color: RGB
  // 奶油打发程度 0.4~1，影响颜色深浅与材质颗粒
  whip: number
  points: PathPoint[]
  // 体积缓存，cm³，由 build 阶段计算，禁止手改
  volume: number
}

// 装饰件实例
export interface Decoration {
  id: ID
  kind: DecorationKind
  // 摆放位置，cm
  x: number
  y: number
  z: number
  // 绕 Y 轴旋转，弧度
  rotationY: number
  // 整体缩放
  scale: number
  color: RGB
  // 数字蜡烛专用：0~9
  digit: number
}

// 一个可给客户挑选的设计方案
export interface CakeDesign {
  id: ID
  name: string
  layers: CakeLayer[]
  paths: PipingPath[]
  decorations: Decoration[]
  lighting: LightingScene
  updatedAt: number
  createdAt: number
}

export interface Order {
  id: ID
  customer: string
  phone: string
  dueDate: string
  servings: number
  budget: number
  note: string
  designIds: ID[]
  createdAt: number
}

export interface AppSettings {
  // 奶油密度 g/cm³
  creamDensity: number
  // 翻糖密度 g/cm³
  fondantDensity: number
  // 淋面密度 g/cm³
  glazeDensity: number
  // 渲染质量档位 0.5 / 0.75 / 1（内部再按帧率自适应）
  renderScale: number
  // 目标帧率
  targetFps: number
}

export interface Database {
  orders: Order[]
  designs: CakeDesign[]
  settings: AppSettings
}
