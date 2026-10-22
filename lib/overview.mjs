import {manifestBounds,validateManifest} from './tiles.mjs';

/**
 * Compute an overview camera that fits the complete declared field extent,
 * rather than a hard-coded camera pose designed for the original 500m square.
 *
 * The scene uses X for east/west, Z for north/south, Y for elevation.
 * A small forward tilt preserves visible building height without sacrificing
 * the ability to see both ends of the north/south extent.
 */
export function overviewPose(manifest,aspect,verticalFovDegrees=55,elevation=4){
  validateManifest(manifest);
  if(!Number.isFinite(aspect)||aspect<=0||
     !Number.isFinite(verticalFovDegrees)||verticalFovDegrees<=5||verticalFovDegrees>=150)
    throw Error('Invalid overview camera dimensions');
  const bounds=manifestBounds(manifest);
  const centerX=(bounds.minX+bounds.maxX)/2;
  const centerZ=(bounds.minZ+bounds.maxZ)/2;
  const halfWidth=(bounds.maxX-bounds.minX)/2;
  const halfDepth=(bounds.maxZ-bounds.minZ)/2;
  const tangent=Math.tan(verticalFovDegrees*Math.PI/360);
  const minDistance=Math.max(halfDepth/tangent,halfWidth/(tangent*aspect));
  const altitude=minDistance*1.23+35;
  return {
    bounds,
    target:[centerX,elevation,centerZ],
    position:[centerX,elevation+altitude,centerZ+altitude*.15],
    requiredAltitude:altitude,
    dimensions:[bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ]
  };
}
