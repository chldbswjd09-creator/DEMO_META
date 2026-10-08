import { describe, it, expect } from "vitest";
import { naturalCompare } from "@/lib/natural";
import { normalizeAdStatus, AD_STATUS_LABEL } from "@/lib/materials/adStatus";

describe("naturalCompare — 자연 정렬", () => {
  it("숫자를 수치로 비교 (문자열 정렬 아님)", () => {
    const arr = ["0731_video_10", "0731_video_1", "0731_video_2"];
    const asc = [...arr].sort(naturalCompare);
    expect(asc).toEqual(["0731_video_1", "0731_video_2", "0731_video_10"]);
  });
  it("한글+숫자", () => {
    const arr = ["쥬스 10", "쥬스 1", "쥬스 2"];
    expect([...arr].sort(naturalCompare)).toEqual(["쥬스 1", "쥬스 2", "쥬스 10"]);
  });
  it("내림차순은 결과 뒤집기", () => {
    const arr = ["a2", "a10", "a1"];
    const desc = [...arr].sort((x, y) => naturalCompare(x, y) * -1);
    expect(desc).toEqual(["a10", "a2", "a1"]);
  });
});

describe("normalizeAdStatus", () => {
  it("유효값 유지, 그 외 active", () => {
    expect(normalizeAdStatus("off")).toBe("off");
    expect(normalizeAdStatus("deleted")).toBe("deleted");
    expect(normalizeAdStatus("active")).toBe("active");
    expect(normalizeAdStatus(undefined)).toBe("active");
    expect(normalizeAdStatus("garbage")).toBe("active");
  });
  it("라벨", () => {
    expect(AD_STATUS_LABEL.active).toBe("집행 중");
    expect(AD_STATUS_LABEL.off).toBe("OFF 처리");
    expect(AD_STATUS_LABEL.deleted).toBe("삭제됨");
  });
});
