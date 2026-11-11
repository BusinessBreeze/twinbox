import hasPerm from '#ba/utils/hasPerm'

// Admin view of all users' sources: read and delete only (config is encrypted and owner-specific).
const getHeaders = (t: any) => [
  { title: 'table.common.owner', key: 'owner_id', get_type: "string" },
  { title: 'table.sources.name', key: 'name', get_type: "string" },
  { title: 'table.sources.type', key: 'type', get_type: "string" },
  { title: 'table.sources.poll_seconds', key: 'poll_seconds', get_type: "string" },
  { title: 'table.sources.max_items_per_fetch', key: 'max_items_per_fetch', get_type: "string" },
  { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
  const features: string[] = []
  if (hasPerm(['sources.crud.delete'])) {
    features.push('delete')
    features.push('deleteMany')
  }

  return {
    title: 'table.sources.title',
    headers: getHeaders(t),
    path_base: '/api/admin/app/sources',
    features,
    readOnMount: true
  }
}
