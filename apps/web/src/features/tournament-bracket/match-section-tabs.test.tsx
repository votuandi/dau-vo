import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseMatchSection } from './match-section';
import { MatchSectionPanel, MatchSectionTabs } from './match-section-tabs';

describe('parseMatchSection', () => {
  it('falls back to the bracket view for missing or unknown values', () => {
    expect(parseMatchSection(null)).toBe('bracket');
    expect(parseMatchSection('nope')).toBe('bracket');
    expect(parseMatchSection('settings')).toBe('settings');
  });
});

describe('MatchSectionTabs', () => {
  it('marks the selected tab, shows counts and selects on click', () => {
    const onSelect = vi.fn();
    render(<MatchSectionTabs counts={{ schedule: 7 }} onSelect={onSelect} selected="schedule" />);
    const schedule = screen.getByRole('tab', { name: /Danh sách trận đấu/ });
    expect(schedule).toHaveAttribute('aria-selected', 'true');
    expect(schedule).toHaveTextContent('7');
    fireEvent.click(screen.getByRole('tab', { name: /Cấu hình/ }));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('moves between tabs with the arrow, Home and End keys', () => {
    const onSelect = vi.fn();
    render(<MatchSectionTabs counts={{}} onSelect={onSelect} selected="bracket" />);
    const bracket = screen.getByRole('tab', { name: /Sơ đồ nhánh đấu/ });
    fireEvent.keyDown(bracket, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('settings');
    fireEvent.keyDown(bracket, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('schedule');
    fireEvent.keyDown(bracket, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('settings');
  });

  it('hides panels that are not selected', () => {
    render(
      <>
        <MatchSectionPanel section="bracket" selected="settings">
          chart
        </MatchSectionPanel>
        <MatchSectionPanel section="settings" selected="settings">
          forms
        </MatchSectionPanel>
      </>,
    );
    expect(screen.getByText('chart').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('forms');
  });
});
