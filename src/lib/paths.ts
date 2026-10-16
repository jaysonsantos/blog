import { PATHS } from "../consts.ts";

export function postPath(id: string): string {
  return `${PATHS.posts}${id}/`;
}

export function tagPath(tag: string): string {
  return `${PATHS.tags}${encodeURIComponent(tag)}/`;
}
