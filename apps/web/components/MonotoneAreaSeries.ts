import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesOptions,
  type CustomSeriesPricePlotValues,
  type CustomSeriesWhitespaceData,
  type ICustomSeriesPaneRenderer,
  type ICustomSeriesPaneView,
  type PaneRendererCustomData,
  type PriceToCoordinateConverter,
  type Time,
} from "lightweight-charts";
import { chartPalette } from "../lib/chart-theme";
import { monotoneCurveSegments, type CurvePoint, type CurveSegment } from "../lib/monotone-curve";

export interface MonotoneAreaData extends CustomData<Time> {
  value: number;
}

export interface MonotoneAreaSeriesOptions extends CustomSeriesOptions {
  lineColor: string;
  topColor: string;
  bottomColor: string;
  lineWidth: number;
}

type RenderTarget = Parameters<ICustomSeriesPaneRenderer["draw"]>[0];
type BitmapScope = Parameters<Parameters<RenderTarget["useBitmapCoordinateSpace"]>[0]>[0];

type RendererView = {
  data: PaneRendererCustomData<Time, MonotoneAreaData>;
  options: MonotoneAreaSeriesOptions;
};

function visibleCurvePoints(
  view: RendererView,
  priceConverter: PriceToCoordinateConverter,
  scope: BitmapScope,
): CurvePoint[] {
  const range = view.data.visibleRange;
  if (range === null) return [];
  const first = Math.max(0, range.from - 1);
  const last = Math.min(view.data.bars.length, range.to + 1);
  const points: CurvePoint[] = [];
  for (const bar of view.data.bars.slice(first, last)) {
    const price = priceConverter(bar.originalData.value);
    if (price === null) continue;
    points.push({ x: bar.x * scope.horizontalPixelRatio, y: price * scope.verticalPixelRatio });
  }
  return points;
}

function traceCurve(context: CanvasRenderingContext2D, segments: readonly CurveSegment[]): void {
  const start = segments[0];
  if (start === undefined) return;
  context.moveTo(start.from.x, start.from.y);
  for (const segment of segments) {
    context.bezierCurveTo(
      segment.control1.x,
      segment.control1.y,
      segment.control2.x,
      segment.control2.y,
      segment.to.x,
      segment.to.y,
    );
  }
}

function fillUnderCurve(
  scope: BitmapScope,
  segments: readonly CurveSegment[],
  options: MonotoneAreaSeriesOptions,
): void {
  const start = segments[0];
  const end = segments[segments.length - 1];
  if (start === undefined || end === undefined) return;
  const context = scope.context;
  const bottom = scope.bitmapSize.height;
  context.beginPath();
  traceCurve(context, segments);
  context.lineTo(end.to.x, bottom);
  context.lineTo(start.from.x, bottom);
  context.closePath();
  const gradient = context.createLinearGradient(0, 0, 0, bottom);
  gradient.addColorStop(0, options.topColor);
  gradient.addColorStop(1, options.bottomColor);
  context.fillStyle = gradient;
  context.fill();
}

function strokeCurve(
  scope: BitmapScope,
  segments: readonly CurveSegment[],
  options: MonotoneAreaSeriesOptions,
): void {
  const context = scope.context;
  context.beginPath();
  traceCurve(context, segments);
  context.strokeStyle = options.lineColor;
  context.lineWidth = options.lineWidth * scope.verticalPixelRatio;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

class MonotoneAreaRenderer implements ICustomSeriesPaneRenderer {
  private view: RendererView | null = null;

  update(data: PaneRendererCustomData<Time, MonotoneAreaData>, options: MonotoneAreaSeriesOptions): void {
    this.view = { data, options };
  }

  draw(target: RenderTarget, priceConverter: PriceToCoordinateConverter): void {
    target.useBitmapCoordinateSpace((scope) => {
      const view = this.view;
      if (view === null) return;
      const segments = monotoneCurveSegments(visibleCurvePoints(view, priceConverter, scope));
      if (segments.length === 0) return;
      fillUnderCurve(scope, segments, view.options);
      strokeCurve(scope, segments, view.options);
    });
  }
}

export class MonotoneAreaSeries
  implements ICustomSeriesPaneView<Time, MonotoneAreaData, MonotoneAreaSeriesOptions>
{
  private readonly paneRenderer = new MonotoneAreaRenderer();

  priceValueBuilder(plotRow: MonotoneAreaData): CustomSeriesPricePlotValues {
    return [plotRow.value];
  }

  isWhitespace(
    data: MonotoneAreaData | CustomSeriesWhitespaceData<Time>,
  ): data is CustomSeriesWhitespaceData<Time> {
    return (data as Partial<MonotoneAreaData>).value === undefined;
  }

  renderer(): ICustomSeriesPaneRenderer {
    return this.paneRenderer;
  }

  update(
    data: PaneRendererCustomData<Time, MonotoneAreaData>,
    seriesOptions: MonotoneAreaSeriesOptions,
  ): void {
    this.paneRenderer.update(data, seriesOptions);
  }

  defaultOptions(): MonotoneAreaSeriesOptions {
    const palette = chartPalette("cobalt");
    return {
      ...customSeriesDefaultOptions,
      lineColor: palette.lineColor,
      topColor: palette.topColor,
      bottomColor: palette.bottomColor,
      lineWidth: 2,
    };
  }
}
