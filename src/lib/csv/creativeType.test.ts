import { describe, it, expect } from "vitest";
import { buildDataset, creativeTypeFromName } from "@/lib/csv/dataset";
import { autoMap } from "@/lib/csv/mapping";
import type { ParsedFile } from "@/lib/csv/parse";

function parsed(headers: string[], rows: Record<string, string>[]): ParsedFile {
  return { fileName: "meta.csv", fileSize: 1000, encoding: "utf-8", delimiter: ",", headers, rows, rowCount: rows.length };
}
function typeOf(headers: string[], row: Record<string, string>) {
  const ds = buildDataset([parsed(headers, [row])], [], autoMap(headers));
  return [...ds.recordsByKey.values()][0].creativeType;
}

const H = ["광고 이름", "지출 금액 (KRW)", "노출", "동영상 3초 이상 재생", "광고 ID"];

describe("creativeTypeFromName — 광고 이름 기준 분류", () => {
  it("_image_ → image, _video_ → video, 없으면 null", () => {
    expect(creativeTypeFromName("0804_image_02")).toBe("image");
    expect(creativeTypeFromName("0811_image_05")).toBe("image");
    expect(creativeTypeFromName("0731_video_1")).toBe("video");
    expect(creativeTypeFromName("0810_VIDEO_03")).toBe("video"); // 대소문자 무관
    expect(creativeTypeFromName("brand_launch")).toBeNull();
    expect(creativeTypeFromName("something_image")).toBe("image"); // 끝에 붙은 경우
  });
});

describe("광고 유형 분류 — 이름 우선, 성과 지표로 추정 금지", () => {
  it("이름에 _image_ 이면 영상 재생 값이 있어도 이미지 (버그 재현: 0804_image_02)", () => {
    // 동영상 3초 재생 값이 있어도 이름이 image → image 유지
    expect(typeOf(H, { "광고 이름": "0804_image_02", "지출 금액 (KRW)": "50000", "노출": "3000", "동영상 3초 이상 재생": "1200", "광고 ID": "1" })).toBe("image");
    expect(typeOf(H, { "광고 이름": "0811_image_05", "지출 금액 (KRW)": "50000", "노출": "3000", "동영상 3초 이상 재생": "900", "광고 ID": "2" })).toBe("image");
  });
  it("이름에 _video_ 이면 영상", () => {
    expect(typeOf(H, { "광고 이름": "0731_video_1", "지출 금액 (KRW)": "50000", "노출": "3000", "동영상 3초 이상 재생": "1000", "광고 ID": "3" })).toBe("video");
  });
  it("이름에 유형 표기가 없으면 '기타' (영상 재생 값으로 영상 추정하지 않음)", () => {
    expect(typeOf(H, { "광고 이름": "brand_launch", "지출 금액 (KRW)": "50000", "노출": "3000", "동영상 3초 이상 재생": "1500", "광고 ID": "4" })).toBe("other");
  });
});
