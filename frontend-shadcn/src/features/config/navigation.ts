import { UserTypeEnum } from '@/utils/enum';
import type { ParseKeys } from 'i18next';
import { BiSolidHome } from 'react-icons/bi';
import { FaClipboardList, FaNotesMedical, FaUsers } from 'react-icons/fa';
import { HiUserCircle } from 'react-icons/hi2';
import { IoMdSettings } from 'react-icons/io';
import { IoBarChartSharp } from 'react-icons/io5';
import type { IconType } from 'react-icons/lib';
import { MdDashboard } from 'react-icons/md';

export interface NavigationItem {
  path: string;
  /** Chiave di traduzione (namespace common) dell'etichetta */
  labelKey: ParseKeys<'common'>;
  icon: IconType;
  allowedRoles: UserTypeEnum[];
}

export const navigationItems: NavigationItem[] = [
  {
    path: '/',
    labelKey: 'navbar.items.homepage',
    icon: BiSolidHome,
    allowedRoles: [UserTypeEnum.Admin, UserTypeEnum.Manager],
  },
  {
    path: '/survey',
    labelKey: 'navbar.items.surveys',
    icon: FaClipboardList,
    allowedRoles: [UserTypeEnum.Admin, UserTypeEnum.Manager],
  },
  {
    path: '/patients',
    labelKey: 'navbar.items.participants',
    icon: FaNotesMedical,
    allowedRoles: [UserTypeEnum.Admin, UserTypeEnum.Manager],
  },
  {
    path: '/module-library',
    labelKey: 'navbar.items.module_library',
    icon: MdDashboard,
    allowedRoles: [UserTypeEnum.Admin],
  },
  {
    path: '/dashboard',
    labelKey: 'navbar.items.dashboard',
    icon: IoBarChartSharp,
    allowedRoles: [UserTypeEnum.Admin, UserTypeEnum.Manager],
  },
  {
    path: '/users',
    labelKey: 'navbar.items.users',
    icon: FaUsers,
    allowedRoles: [UserTypeEnum.Admin],
  },
];

export const extraNavigationItems: NavigationItem[] = [
  {
    path: '/settings',
    icon: IoMdSettings,
    labelKey: 'navbar.items.settings',
    allowedRoles: [UserTypeEnum.Admin],
  },
  {
    path: '/profile',
    icon: HiUserCircle,
    labelKey: 'navbar.items.profile',
    allowedRoles: [UserTypeEnum.Admin, UserTypeEnum.Manager],
  },
];
