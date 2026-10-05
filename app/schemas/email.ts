import { apiPost } from "#ba/utils/fetch/wrappers";

const getHeaders = (t: any) => [
    { title: "table.email.date", key: "date", get_type: "short_date" },
    { title: "table.email.from", key: "from", get_type: "string" },
    { title: "table.email.subject", key: "subject", get_type: "string" },
    { title: "table.email.staging", key: "staging_item", get_type: "boolean" },
    { title: "table.common.actions", key: "actions", sortable: false },
];

export default function (t: any, callbacks?: { onViewEmail?: (item: any) => void }) {
    return {
        title: "table.email.title",
        headers: getHeaders(t),
        path_base: "/api/v0.1/app/email",
        features: ["delete", "deleteMany"],
        readOnMount: true,
        customActions: [
            {
                icon: "mdi-eye-outline",
                tooltip: t("table.common.view") || "View Email",
                onActionClick: callbacks?.onViewEmail
            }
        ],
        customMulti: [
            {
                icon: "mdi-test-tube",
                tooltip: t("table.email.set_staging") || "Set Staging",
                onClick: async (selected: any[]) => {
                    const ids = selected.map(s => s.id);
                    await apiPost("/api/v0.1/app/email/set_staging", { ids, staging_item: 1 });
                }
            },
            {
                icon: "mdi-test-tube-off",
                tooltip: t("table.email.clear_staging") || "Clear Staging",
                onClick: async (selected: any[]) => {
                    const ids = selected.map(s => s.id);
                    await apiPost("/api/v0.1/app/email/set_staging", { ids, staging_item: 0 });
                }
            }
        ]
    };
}
