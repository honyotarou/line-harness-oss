/** 全装飾 PNG（`public/mock-design-elements` / Downloads `design_elements` と同期） */
export const WORKSPACE_DECOR_ASSETS = [
  '01_blue_circle.png',
  '02_green_blob.png',
  '03_peach_wave_area.png',
  '04_purple_cloud.png',
  '05_blue_line_area.png',
  '06_blue_donut.png',
  '07_green_donut.png',
  '08_orange_donut.png',
  '09_purple_donut.png',
  '10_blue_circle_outline.png',
  '11_blue_overlapping_circles.png',
  '12_orange_overlapping_circles.png',
  '13_purple_leaf.png',
  '14_green_leaf.png',
  '15_blue_droplets.png',
  '16_orange_leaf.png',
  '17_purple_leaf_2.png',
  '18_green_branch.png',
  '19_blue_loop_arrow.png',
  '20_green_loop_arrow.png',
  '21_purple_dashed_arrow.png',
  '22_orange_dashed_arc.png',
  '23_blue_arrow.png',
  '24_blue_burst.png',
  '25_blue_scribble.png',
  '26_green_scribble.png',
  '27_orange_scribble.png',
  '28_purple_wavy_line.png',
  '29_blue_arc.png',
  '30_orange_arc.png',
  '31_blue_star_solid.png',
  '32_green_star_outline.png',
  '33_orange_star_outline.png',
  '34_purple_star_outline.png',
  '35_green_sparkle.png',
  '36_orange_sparkle.png',
  '37_blue_dot_grid.png',
  '38_green_dot_grid.png',
  '39_orange_dot_grid.png',
  '40_purple_dot_grid.png',
  '41_blue_dot_circle.png',
  '42_green_dot_circle.png',
  '43_orange_dot_circle.png',
  '44_purple_dot_circle.png',
  '45_blue_plus_sparkles.png',
  '46_purple_plus_sparkles.png',
  '47_blue_area_chart.png',
  '48_green_area_chart.png',
  '49_blue_wave_line.png',
  '50_green_wave_line.png',
  '51_orange_dashed_wave.png',
  '52_purple_dashed_wave.png',
  '55_orange_line_chart.png',
  '56_purple_line_chart.png',
  '57_blue_bar_chart.png',
  '58_green_orange_candlestick.png',
  '59_blue_purple_candlestick.png',
  '60_gradient_pills.png',
] as const;

export function pickDecorIndices(seed: string, count: number, modulo: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const out: number[] = [];
  let guard = 0;
  while (out.length < count && guard < 500) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const v = h % modulo;
    if (!out.includes(v)) out.push(v);
    guard++;
  }
  while (out.length < count) {
    out.push(out.length % modulo);
  }
  return out;
}
