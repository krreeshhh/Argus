import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MenuBar } from './MenuBar';

describe('MenuBar Component', () => {
  it('renders menu bar titles and shortcuts', () => {
    render(<MenuBar />);
    expect(screen.getByText(/Argus/)).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Graph')).toBeInTheDocument();
    expect(screen.getByText('Filter')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});
