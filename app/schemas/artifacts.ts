const getHeaders = (t: any) => [
  { title: t('table.artifacts.id'), key: 'filename', get_type: 'string' },
  { title: t('table.artifacts.extension'), key: 'mime', get_type: 'string' },
  { title: t('table.artifacts.size'), key: 'size', get_type: 'string' },
  { title: t('table.artifacts.updatedAt'), key: 'createdAt', get_type: 'short_date' },
  { title: t('table.common.actions'), key: 'actions', sortable: false }
];

export default function (t: any, callbacks?: { onView?: (item: any) => void; onDownload?: (item: any) => void }) {
  return {
    title: t('table.artifacts.title') as string,
    headers: getHeaders(t),
    path_base: '/api/v0.1/app/artifacts',
    features: ['delete', 'deleteMany'],
    readOnMount: true,
    customActions: [
      {
        icon: 'mdi-eye',
        tooltip: t('table.artifacts.view') as string,
        color: 'primary',
        onActionClick: callbacks?.onView
      },
      {
        icon: 'mdi-download',
        tooltip: t('table.artifacts.download') as string,
        color: 'primary',
        onActionClick: callbacks?.onDownload
      }
    ]
  };
}
