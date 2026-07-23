import { useLocation, useNavigate } from 'react-router-dom';
import type { StaffUser } from '../api';
import {
  canNavItem,
  getActiveSection,
  getFirstPermittedItem,
  getPermittedSections,
  type NavGroup,
} from './navConfig';

const SECTION_LAST_KEY = 'bg_section_last_path';

function readLastPath(sectionId: string): string | null {
  try {
    const raw = sessionStorage.getItem(SECTION_LAST_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[sectionId] ?? null;
  } catch {
    return null;
  }
}

export function rememberSectionPath(sectionId: string, path: string) {
  try {
    const raw = sessionStorage.getItem(SECTION_LAST_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[sectionId] = path;
    sessionStorage.setItem(SECTION_LAST_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function resolveSectionTarget(section: NavGroup, user: StaffUser): string {
  const last = readLastPath(section.id);
  if (last) {
    const item = section.items.find((i) => i.to === last);
    if (item && canNavItem(user, item)) return item.to;
  }
  return getFirstPermittedItem(section, user)?.to ?? '/account';
}

interface SectionBarProps {
  user: StaffUser;
  activeSectionId?: string;
  onSelectSection?: (section: NavGroup) => void;
}

export function SectionBar({ user, activeSectionId, onSelectSection }: SectionBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const sections = getPermittedSections(user);
  const derived = getActiveSection(location.pathname);
  const currentId = activeSectionId ?? derived?.id;

  const selectSection = (section: NavGroup) => {
    onSelectSection?.(section);
    const target = resolveSectionTarget(section, user);
    if (target) navigate(target);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % sections.length;
    if (e.key === 'ArrowLeft') next = (index - 1 + sections.length) % sections.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = sections.length - 1;
    const el = document.getElementById(`section-tab-${sections[next].id}`);
    el?.focus();
    selectSection(sections[next]);
  };

  return (
    <div className="admin-shell-section-bar" role="tablist" aria-label="Admin sections">
      {sections.map((section, index) => {
        const Icon = section.icon;
        const selected = section.id === currentId;
        return (
          <button
            key={section.id}
            id={`section-tab-${section.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`section-rail-${section.id}`}
            tabIndex={selected ? 0 : -1}
            className={`admin-shell-section-tab${selected ? ' admin-shell-section-tab--active' : ''}`}
            onClick={() => selectSection(section)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            <Icon size={15} aria-hidden />
            <span>{section.label}</span>
          </button>
        );
      })}
    </div>
  );
}
