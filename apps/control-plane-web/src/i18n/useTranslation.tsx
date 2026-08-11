import { useTranslation } from 'react-i18next';

export const useComponentTranslation = (componentName: string) =>
  useTranslation('webvibes', { keyPrefix: `components.${componentName}` });

export const useEnumTranslation = (enumName: string) =>
  useTranslation('webvibes', { keyPrefix: `enums.${enumName}` });
