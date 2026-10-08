// 자연 정렬(natural sort): "0731_video_2" < "0731_video_10" 처럼 숫자를 수치로 비교한다.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
