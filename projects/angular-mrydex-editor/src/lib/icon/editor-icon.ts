import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * SVG icon of a button, painted as a CSS mask with the button color (`currentColor`).
 * The SVG never enters the DOM: a mask image cannot run scripts, so any string is safe.
 */
@Component({
  selector: 'mrydex-editor-icon',
  template: '',
  styles: `
    :host {
      display: inline-block;
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      background-color: currentColor;
      mask-position: center;
      mask-size: contain;
      mask-repeat: no-repeat;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.mask-image]': 'image()',
  },
})
export class EditorIcon {
  readonly svg = input.required<string>();

  protected readonly image = computed(() => {
    // As an image (not inline), an SVG without `xmlns` is not rendered.
    const svg = this.svg().trim();
    const withNamespace = /\sxmlns=/.test(svg) ? svg : svg.replace('<svg', `<svg xmlns="${SVG_NAMESPACE}"`);
    return `url("data:image/svg+xml,${encodeURIComponent(withNamespace)}")`;
  });
}
