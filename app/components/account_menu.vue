<template>
        <!-- <v-list-item>
            <v-list-item-title>Forward Email: {{ user?.email }}</v-list-item-title>
        </v-list-item> -->
        <!-- <v-list-item @click="router.push('/notifications')" link>
            <v-list-item-title class="text-primary">{{ t('frontend.nav.notifications') }}</v-list-item-title>
        </v-list-item> -->
        <v-list-item @click="router.push('/howto')" link>
            <v-list-item-title class="text-primary">{{ t('frontend.nav.howto') }}</v-list-item-title>
        </v-list-item>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { user } = useUserSession()
const router = useRouter()

</script>