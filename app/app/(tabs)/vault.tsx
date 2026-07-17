import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Speech from "expo-speech";
import { Search, Volume2 } from "lucide-react-native";

import { colors } from "../../src/theme";
import { useProgressQuery, useWordTopicsQuery, useWordsInfiniteQuery } from "../../src/api/hooks";
import { getSrsBoxMeta } from "../../src/srs";
import type { Word } from "@art/shared";

/**
 * Small, fixed set of part-of-speech tags used across the whole vocabulary
 * bank (checked against the seeded data directly) - hardcoded here rather
 * than derived from a full word list, since there are only ever a handful
 * of distinct values and they don't change without a data-model change.
 */
const POS_OPTIONS = ["n.", "v.", "adj.", "adv.", "conj."];

/** Debounce delay before a search keystroke triggers a server-side query. */
const SEARCH_DEBOUNCE_MS = 300;

export default function VaultScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<string | null>(null);

  // Debounce the search box so every keystroke doesn't fire a new
  // server-side query - only the value the user pauses on does.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const { data: topicsData } = useWordTopicsQuery();
  const topicOptions = topicsData?.topics ?? [];

  // Looked up per row to show an SRS box badge - most users have practiced
  // only a fraction of the ~4900-word bank, so this list is naturally much
  // smaller than the word table itself.
  const { data: progressData } = useProgressQuery();
  const boxByWordId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of progressData?.progress ?? []) map.set(p.wordId, p.srsBox);
    return map;
  }, [progressData]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useWordsInfiniteQuery({
    topicId: topicFilter ?? undefined,
    partOfSpeech: posFilter ?? undefined,
    search: debouncedQuery || undefined,
  });

  // Flatten the paginated response into a single list for FlatList. Only
  // the pages actually fetched (default 50 words each) are ever in memory -
  // not the whole ~4900-word table.
  const words = useMemo(() => data?.pages.flatMap((page) => page.words) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        data={words}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <WordRow entry={item} srsBox={boxByWordId.get(item.id)} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ paddingBottom: 16 }}>
            <Text className="text-2xl text-ink" style={{ fontFamily: "Outfit_700Bold", paddingTop: 40 }}>
              Kho từ vựng
            </Text>
            <Text className="mt-1 text-xs text-ink/50" style={{ fontFamily: "Outfit" }}>
              {total} từ trong {topicOptions.length} chủ đề
            </Text>

            {/* Search input */}
            <View
              className="mt-4 flex-row items-center gap-2 rounded-full bg-white px-4 py-3"
              style={{ borderWidth: 1, borderColor: colors.border }}
            >
              <Search size={16} color={colors.ink} opacity={0.4} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm từ hoặc nghĩa tiếng Việt..."
                placeholderTextColor="#94a3b8"
                style={{ flex: 1, fontFamily: "Outfit", fontSize: 14, color: colors.ink }}
              />
            </View>

            {/* Topic filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
              <FilterChip label="Tất cả chủ đề" active={topicFilter === null} onPress={() => setTopicFilter(null)} />
              {topicOptions.map((t) => (
                <FilterChip
                  key={t.topicId}
                  label={t.topicNameVi}
                  active={topicFilter === t.topicId}
                  onPress={() => setTopicFilter(t.topicId === topicFilter ? null : t.topicId)}
                />
              ))}
            </ScrollView>

            {/* Word-type filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" contentContainerStyle={{ gap: 8 }}>
              <FilterChip label="Tất cả loại từ" active={posFilter === null} onPress={() => setPosFilter(null)} tone="indigo" />
              {POS_OPTIONS.map((pos) => (
                <FilterChip
                  key={pos}
                  label={pos}
                  active={posFilter === pos}
                  onPress={() => setPosFilter(pos === posFilter ? null : pos)}
                  tone="indigo"
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="mt-10 items-center">
              <ActivityIndicator color={colors.emerald500} />
            </View>
          ) : (
            <Text className="mt-10 text-center text-sm text-ink/40" style={{ fontFamily: "Outfit" }}>
              Không tìm thấy từ nào phù hợp.
            </Text>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="mt-4 items-center">
              <ActivityIndicator color={colors.emerald500} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

function WordRow({ entry, srsBox }: { entry: Word; srsBox: number | undefined }) {
  const boxMeta = srsBox !== undefined ? getSrsBoxMeta(srsBox) : null;

  return (
    <View
      className="flex-row items-center px-1 py-3"
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Pressable
        onPress={() => Speech.speak(entry.text, { language: "en-US" })}
        className="h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: colors.indigo100 }}
      >
        <Volume2 size={16} color={colors.indigo600} />
      </Pressable>
      <View className="ml-3 flex-1">
        <Text style={{ fontFamily: "JetBrainsMono_700Bold", fontSize: 14, color: colors.ink }}>
          {entry.text}
        </Text>
        <Text className="text-xs text-ink/50" style={{ fontFamily: "PlusJakartaSans" }}>
          {entry.meaningVi} · {entry.partOfSpeech}
        </Text>
      </View>
      <View
        className="rounded-full px-2.5 py-1"
        style={{ backgroundColor: boxMeta ? boxMeta.bg : colors.cream2 }}
      >
        <Text style={{ fontFamily: "Outfit_700Bold", fontSize: 10, color: boxMeta ? boxMeta.fg : colors.inkMuted }}>
          {boxMeta ? `Hộp ${srsBox}` : "Mới"}
        </Text>
      </View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  tone = "emerald",
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: "emerald" | "indigo";
}) {
  const activeColor = tone === "emerald" ? colors.emerald500 : colors.indigo600;
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-3.5 py-2"
      style={{
        backgroundColor: active ? activeColor : "white",
        borderWidth: 1,
        borderColor: active ? activeColor : "#eee7da",
      }}
    >
      <Text
        style={{
          fontFamily: "Outfit_500Medium",
          fontSize: 12,
          color: active ? "white" : colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
