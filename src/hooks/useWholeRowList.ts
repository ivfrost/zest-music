import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

// Fallback only; the first row reports its real height.
const ROW_HEIGHT = 63;
export const SEPARATOR_HEIGHT = 1;

export function useWholeRowList(hasHeader: boolean) {
  const [pageHeight, setPageHeight] = useState(0);
  const [cardTop, setCardTop] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(0);

  const rowPitch = Math.round(rowHeight || ROW_HEIGHT) + SEPARATOR_HEIGHT;
  const listRows = Math.floor(
    (pageHeight - cardTop - (hasHeader ? headerHeight : 0) + SEPARATOR_HEIGHT) /
      rowPitch,
  );
  // Whole pitches, so the last row is never clipped; the card's bottom strip
  // hides the separator that would sit at the edge.
  const listMaxHeight = listRows > 0 ? listRows * rowPitch : undefined;

  return {
    listMaxHeight,
    onPageLayout: (event: LayoutChangeEvent) =>
      setPageHeight(event.nativeEvent.layout.height),
    onCardLayout: (event: LayoutChangeEvent) =>
      setCardTop(event.nativeEvent.layout.y),
    onHeaderLayout: (event: LayoutChangeEvent) =>
      setHeaderHeight(event.nativeEvent.layout.height),
    onRowLayout: (event: LayoutChangeEvent) =>
      setRowHeight(event.nativeEvent.layout.height),
  };
}
