---
aside: false
outline: false
---

<script setup>
import { useData } from "vitepress";

const { params } = useData();
</script>

<div v-if="params.error" class="warning custom-block">
  <p class="custom-block-title">features/{{ params.feature }}/contracts/openapi.yaml is not valid YAML</p>
  <pre>{{ params.error }}</pre>
</div>
<OASpec v-else :spec="params.spec" />
