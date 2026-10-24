/** Approved A design. Existing camera bearing owns timing; no animation loop. */
export function setupCompass(element){
 if(!element)return {update(){}};
 element.classList.remove('paper');element.setAttribute('aria-label','北の方向');
 element.innerHTML=`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3C48 2 61 16 60 32c2 16-12 29-28 29S3 48 4 32C2 15 16 3 32 3Z" fill="var(--paper)" stroke="var(--edge)" stroke-width="1.3"/><circle cx="32" cy="32" r="25" fill="none" stroke="var(--edge)" stroke-opacity=".28" stroke-width=".7"/><path d="M14 32h3m30 0h3M32 51v2M18 18l2 2m24-2-2 2m2 24-2-2m-22 0-2 2" fill="none" stroke="var(--edge)" stroke-width="1.2" stroke-linecap="round"/><g class="north-needle"><path d="M32 16 36 33 32 30 28 33Z" fill="var(--focus)"/><path d="M32 48 28 31 32 34 36 31Z" fill="var(--ink)"/></g><circle cx="32" cy="32" r="2.1" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2"/><text class="north-label" x="32" y="12.3" fill="var(--focus)" font-family="system-ui,sans-serif" font-size="11" font-weight="600" text-anchor="middle">N</text></svg>`;
 const needle=element.querySelector('.north-needle'),label=element.querySelector('.north-label');let last=NaN;
 return {update(bearing){if(bearing===last||!Number.isFinite(bearing))return;last=bearing;needle.style.transform=`rotate(${-bearing}rad)`;label.setAttribute('x',String(32-23*Math.sin(bearing)));label.setAttribute('y',String(35.3-23*Math.cos(bearing)));}};
}
