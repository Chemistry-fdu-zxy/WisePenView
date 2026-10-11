import { ChevronDown, ChevronRight, NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMatch, useNavigate } from 'react-router-dom';
import { useStore } from 'zustand';

import { useCurrentRouteHandle } from '@/bootstrap/router';
import type { HeaderNavItem } from '@/components/business/Sidebar/_common/header/HeaderNav/index.type';
import { useNoteService } from '@/domains';
import { RESOURCE_KIND } from '@/domains/Resource/model/resourceTarget';
import { resourceDisplayNameCache } from '@/domains/Resource/session/resourceDisplayNameCache';
import { useApi } from '@/hooks/useApi';
import { useOpenResource } from '@/hooks/useOpenResource';
import { useAppAuth } from '@/layouts/App/_context';
import { useMyNotesStore } from '@/layouts/Resource/_store/useMyNotesStore';
import { findReusableNote } from '@/layouts/Resource/localNoteModel';
import { createClientError, FRONTEND_CLIENT_ERROR } from '@/utils/error';
import { APP_ROUTE_PATH } from '@/utils/navigation/appRoute';

import { APP_SIDEBAR_HEADER_ITEMS, type AppSidebarNavigateItem } from './appSidebarNavigation';

interface UseAppSidebarHeaderNavOptions {
  onNavigate?: () => void;
}

interface AppSidebarHeaderNavResult {
  items: HeaderNavItem[];
  selectedKey?: string;
}

export function useAppSidebarHeaderNav({
  onNavigate,
}: UseAppSidebarHeaderNavOptions = {}): AppSidebarHeaderNavResult {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const appAuth = useAppAuth();
  const noteService = useNoteService();
  const openResource = useOpenResource();
  const routeSelectedKey = useCurrentRouteHandle()?.appSidebar?.selectedHeaderNavKey ?? undefined;
  const activeId = useMatch(`${APP_ROUTE_PATH.RESOURCES}/:resourceType/:resourceId`)?.params
    .resourceId;
  const { notes, expanded, creating } = useMyNotesStore();
  const displayNames = useStore(resourceDisplayNameCache, (state) => state.byResourceId);
  const selectedKey = notes.some((note) => note.resourceId === activeId)
    ? expanded
      ? `my-note-${activeId}`
      : 'my-notes'
    : routeSelectedKey;

  const { loading: creatingNote, run: createNote } = useApi(
    async () => {
      if (useMyNotesStore.getState().creating) return undefined;
      useMyNotesStore.setState({ creating: true });
      try {
        const cachedNames = resourceDisplayNameCache.getState().byResourceId;
        const candidate = findReusableNote(
          useMyNotesStore
            .getState()
            .notes.map((note) => ({ ...note, name: cachedNames[note.resourceId] ?? note.name }))
        );
        if (candidate) return { resourceId: candidate.resourceId, title: candidate.name };
        const title = t('navigation.defaultNoteTitle');
        const result = await noteService.createNote({ title });
        if (!result.resourceId) {
          throw createClientError(FRONTEND_CLIENT_ERROR.NOTE_CREATE_RESOURCE_ID_MISSING);
        }
        useMyNotesStore.getState().add(result.resourceId, title, true);
        return { resourceId: result.resourceId, title };
      } finally {
        useMyNotesStore.setState({ creating: false });
      }
    },
    {
      manual: true,
      onSuccess: (result) => {
        if (!result) return;
        const { resourceId, title } = result;
        useMyNotesStore.getState().reveal(resourceId);
        openResource({
          resourceId,
          resourceType: RESOURCE_KIND.NOTE,
          resourceName: title,
        });
      },
    }
  );

  const handleNavItemPress = (item: AppSidebarNavigateItem) => {
    if (!appAuth.isAuthenticated) {
      appAuth.requireLogin();
      return;
    }
    navigate(item.to);
    onNavigate?.();
  };

  const handleCreateNote = () => {
    if (!appAuth.isAuthenticated) {
      appAuth.requireLogin();
      return;
    }
    if (!creatingNote) {
      createNote();
      onNavigate?.();
    }
  };

  const items: HeaderNavItem[] = APP_SIDEBAR_HEADER_ITEMS.map((item) => {
    // createNote 类型的菜单项不导航到其他页面，而是触发创建笔记操作。
    if (item.type === 'createNote') {
      return {
        key: item.key,
        name: t(item.labelKey),
        icon: item.icon,
        isDisabled: creatingNote || creating,
        onPress: handleCreateNote,
      };
    }

    // navigate 类型的菜单项负责跳转到指定页面。
    return {
      key: item.key,
      name: t(item.labelKey),
      icon: item.icon,
      onPress: () => handleNavItemPress(item),
    };
  });

  const noteItems: HeaderNavItem[] = [
    {
      key: 'my-notes',
      name: t('navigation.myNotes'),
      icon: expanded ? ChevronDown : ChevronRight,
      expanded,
      onPress: () => useMyNotesStore.setState({ expanded: !expanded }),
    },
  ];
  if (expanded) {
    if (!notes.length)
      noteItems.push({
        key: 'my-notes-empty',
        name: t('navigation.myNotesEmpty'),
        icon: NotebookPen,
        isDisabled: true,
        nested: true,
        onPress: () => {},
      });
    notes.forEach((note) =>
      noteItems.push({
        key: `my-note-${note.resourceId}`,
        name: displayNames[note.resourceId] ?? note.name,
        icon: NotebookPen,
        nested: true,
        onPress: () => {
          openResource({
            resourceId: note.resourceId,
            resourceType: RESOURCE_KIND.NOTE,
            resourceName: note.name,
          });
          onNavigate?.();
        },
      })
    );
  }
  items.splice(2, 0, ...noteItems);

  return {
    items,
    selectedKey,
  };
}
