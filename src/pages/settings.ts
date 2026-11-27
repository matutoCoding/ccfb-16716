import { store } from '../state/store';
import { h, button, clear, field, sliderRow } from '../ui/dom';
import { db } from '../lib/db';
import { downloadText } from '../lib/util';
import { runSelfTests, type SelfTestResult } from '../lib/selfTest';
import { buildTestPlans } from '../data/presets';

export function mountSettings(root: HTMLElement): () => void {
  const s = store.state.settings;
  const testBox = h('div', { class: 'test-results' }, h('p', { class: 'muted', text: '尚未运行。测试包含体积公式、扫掠网格误差、三套方案和 IndexedDB。' }));

  const scaleSlider = sliderRow(`渲染分辨率 ${Math.round(s.renderScale * 100)}%`, s.renderScale, 0.55, 1.15, 0.05, (v) => store.updateSettings({ renderScale: v }), (v) => `${Math.round(v * 100)}%`);
  const dprSelect = h('select', { on: { change: (e) => store.updateSettings({ maxPixelRatio: Number((e.target as HTMLSelectElement).value) }) } }) as HTMLSelectElement;
  for (const v of [1, 1.5, 2]) {
    const opt = h('option', { attrs: { value: v }, text: `${v}×` }) as HTMLOptionElement;
    if (s.maxPixelRatio === v) opt.selected = true;
    dprSelect.append(opt);
  }

  const page = h('div', { class: 'page settings-page' },
    h('div', { class: 'page-header' }, h('div', {}, h('h1', { text: '设置与测试中心' }), h('p', { class: 'muted', text: '性能档位、材料密度、IndexedDB 数据管理和验收自检。' }))),
    h('div', { class: 'settings-grid' },
      h('section', { class: 'panel' },
        h('h2', { text: '交互性能' }),
        scaleSlider,
        field('设备像素比上限', dprSelect, '高分屏建议 1.5；上百朵挤花掉帧时降到 1.0 或分辨率 75%。'),
        check('显示 FPS / 三角面', s.showFps, (v) => store.updateSettings({ showFps: v })),
        check('自动旋转', s.autoRotate, (v) => store.updateSettings({ autoRotate: v })),
        check('柔和阴影', s.shadows, (v) => store.updateSettings({ shadows: v })),
        check('奶油颗粒 shader', s.grain, (v) => store.updateSettings({ grain: v })),
        check('自动保存到 IndexedDB', s.autoSave, (v) => store.updateSettings({ autoSave: v }))
      ),
      h('section', { class: 'panel' },
        h('h2', { text: '材料密度（g/ml）' }),
        sliderRow(`奶油密度 ${s.densityCream.toFixed(2)}`, s.densityCream, 0.8, 1.4, 0.01, (v) => store.updateSettings({ densityCream: v }), (v) => v.toFixed(2)),
        sliderRow(`翻糖密度 ${s.densityFondant.toFixed(2)}`, s.densityFondant, 0.9, 1.6, 0.01, (v) => store.updateSettings({ densityFondant: v }), (v) => v.toFixed(2)),
        sliderRow(`淋面密度 ${s.densityGlaze.toFixed(2)}`, s.densityGlaze, 0.9, 1.6, 0.01, (v) => store.updateSettings({ densityGlaze: v }), (v) => v.toFixed(2)),
        h('p', { class: 'muted small', text: '体积统计单位为 ml（cm³），重量 = 体积 × 密度。花嘴截面积由轮廓多边形精确计算。' })
      ),
      h('section', { class: 'panel' },
        h('h2', { text: '三套测试方案' }),
        h('div', { class: 'scenario-list' },
          scenarioButton('① 三层婚礼蛋糕', '96 人 · 翻糖/奶油 · 玫瑰与双层花边', 'GD-W261218'),
          scenarioButton('② 镜面淋面慕斯', '10 人 · 勃艮第淋面 · 15 条滴落', 'GD-M261202'),
          scenarioButton('③ 数字生日蛋糕', '30 人 · 方形奶油 · 星星花与 3/0 蜡烛', 'GD-B261128')
        ),
        button('恢复三套测试数据（清空当前数据）', async () => {
          if (window.confirm('确定清空并恢复测试方案？')) {
            await store.resetAndSeed();
            store.toast('测试方案已恢复');
          }
        }, 'btn-danger-ghost')
      ),
      h('section', { class: 'panel' },
        h('h2', { text: '数据管理' }),
        h('div', { class: 'button-grid' },
          button('导出全部 JSON', async () => {
            const data = { orders: store.state.orders, designs: store.state.designs, settings: store.state.settings, exportedAt: new Date().toISOString() };
            downloadText(`gateau-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
          }, 'btn-secondary'),
          importButton(),
          button('清空全部数据', async () => {
            if (window.confirm('确定清空 IndexedDB 中所有订单和方案？此操作不可撤销。')) {
              await db.clearAll();
              localStorage.removeItem('gateau-selection-v1');
              window.location.reload();
            }
          }, 'btn-danger')
        ),
        storageInfo()
      ),
      h('section', { class: 'panel test-panel wide' },
        h('div', { class: 'panel-title-row' }, h('h2', { text: '自动验收 / 体积误差' }), button('运行自检', async () => {
          clear(testBox);
          testBox.append(h('p', { class: 'muted', text: '运行中…' }));
          const results = await runSelfTests();
          renderResults(results);
        }, 'btn-primary btn-sm')),
        testBox
      )
    )
  );

  function renderResults(results: SelfTestResult[]): void {
    clear(testBox);
    const failed = results.filter((r) => !r.pass);
    testBox.append(
      h('div', { class: `test-summary ${failed.length ? 'fail' : 'pass'}`, text: failed.length ? `${failed.length} 项失败` : `全部 ${results.length} 项通过` }),
      h('div', { class: 'test-result-list' }, ...results.map((r) => h('div', { class: `test-result ${r.pass ? 'pass' : 'fail'}` }, h('span', { text: r.pass ? '✓' : '×' }), h('strong', { text: r.name }), h('small', { text: r.detail }))))
    );
  }

  root.append(page);
  return () => {};
}

function check(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const input = h('input', { attrs: { type: 'checkbox' }, on: { change: (e) => onChange((e.target as HTMLInputElement).checked) } }) as HTMLInputElement;
  input.checked = checked;
  return h('label', { class: 'check-row' }, input, h('span', { text: label }));
}

function scenarioButton(title: string, desc: string, code: string): HTMLElement {
  return h('button', {
    type: 'button',
    class: 'scenario-btn',
    on: {
      click: async () => {
        let order = store.state.orders.find((o) => o.code === code);
        if (!order) {
          await store.resetAndSeed();
          order = store.state.orders.find((o) => o.code === code);
        }
        if (order) {
          store.selectOrder(order.id);
          const d = store.designsForOrder(order.id)[0];
          if (d) store.selectDesign(d.id);
          store.setRoute('preview');
        }
      }
    }
  }, h('strong', { text: title }), h('small', { text: desc }));
}

function importButton(): HTMLElement {
  const input = h('input', {
    attrs: { type: 'file', accept: 'application/json,.json' },
    on: {
      change: async () => {
        const file = (input as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!Array.isArray(data.orders) || !Array.isArray(data.designs)) throw new Error('文件缺少 orders/designs');
          await db.clearAll();
          await Promise.all([...data.orders.map((o: unknown) => db.putOrder(o as never)), ...data.designs.map((d: unknown) => db.putDesign(d as never))]);
          await store.init();
          store.toast('导入成功');
        } catch (err) {
          window.alert(`导入失败：${(err as Error).message}`);
        }
      }
    }
  }) as HTMLInputElement;
  input.hidden = true;
  return h('label', { class: 'btn btn-secondary file-btn' }, h('span', { text: '导入 JSON' }), input);
}

function storageInfo(): HTMLElement {
  const box = h('p', { class: 'muted small storage-info', text: 'IndexedDB：gateau-studio' });
  if (navigator.storage?.estimate) {
    void navigator.storage.estimate().then((est) => {
      box.textContent = `IndexedDB：gateau-studio · 已用约 ${((est.usage ?? 0) / 1024).toFixed(1)} KB / 配额 ${((est.quota ?? 0) / 1024 / 1024).toFixed(0)} MB`;
    });
  }
  return box;
}

// 保持 buildTestPlans 引用，便于打包分析和后续扩展。
void buildTestPlans;
