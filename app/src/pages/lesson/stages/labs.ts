import type { Component } from 'solid-js'
import type { InteractiveContent } from '../../../lib/lessons'
import PlaceholderLab from './PlaceholderLab'

/** What a lab is drawn from: its stage's content. */
export type LabProps = { content: InteractiveContent }

/**
 * The labs the app can draw, by the `component` key a lab's content names. A
 * real lab is a new entry here and a migration that sets its stage's key; a
 * key the app doesn't know yet draws the placeholder.
 */
export const LABS: Record<string, Component<LabProps>> = {
  placeholder: PlaceholderLab,
}

export const labFor = (key: string | undefined): Component<LabProps> =>
  (key !== undefined && Object.hasOwn(LABS, key) ? LABS[key] : undefined) ?? PlaceholderLab
