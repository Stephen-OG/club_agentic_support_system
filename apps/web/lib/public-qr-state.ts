import type { PublicServicePointSummary } from "./auth/types";

type PublicQrServicePointState = {
  qrPoint?: PublicServicePointSummary | null;
  servicePoint?: PublicServicePointSummary | null;
};

export function getPublicQrServicePoint(state: PublicQrServicePointState) {
  return state.servicePoint ?? state.qrPoint ?? null;
}
