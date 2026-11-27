export interface PigmentCard {
  id: string;
  name: string;
  hex: string;
  intensity: number;
}

export const PIGMENT_CARDS: PigmentCard[] = [
  { id: 'ivory', name: '奶油白', hex: '#fff1d6', intensity: 0.08 },
  { id: 'champagne', name: '香槟金', hex: '#e7c58d', intensity: 0.28 },
  { id: 'blush', name: '豆沙粉', hex: '#e8a7ad', intensity: 0.42 },
  { id: 'rose', name: '玫瑰红', hex: '#c94f6d', intensity: 0.72 },
  { id: 'wine', name: '勃艮第', hex: '#7b1e3a', intensity: 0.92 },
  { id: 'matcha', name: '抹茶绿', hex: '#8aa66b', intensity: 0.58 },
  { id: 'sage', name: '鼠尾草', hex: '#b9c7a4', intensity: 0.34 },
  { id: 'sky', name: '雾霾蓝', hex: '#91b7cf', intensity: 0.42 },
  { id: 'lavender', name: '薰衣草', hex: '#b9a7d9', intensity: 0.45 },
  { id: 'lemon', name: '柠檬黄', hex: '#f2d86b', intensity: 0.55 },
  { id: 'chocolate', name: '巧克力棕', hex: '#6b3f2a', intensity: 0.82 },
  { id: 'blackcocoa', name: '黑可可', hex: '#2b211d', intensity: 0.96 }
];

export const DECORATION_COLORS = ['#d92f45', '#2f6fd9', '#f4c542', '#4caf6b', '#ffffff', '#7b3f99', '#ff8a3d'];
