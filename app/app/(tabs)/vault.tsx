import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Speech from "expo-speech";
import { Search, Volume2 } from "lucide-react-native";

import { colors } from "../../src/theme";
import { useWordTopicsQuery, useWordsInfiniteQuery } from "../../src/api/hooks";
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
        renderItem={({ item }) => <WordRow entry={item} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 10 }}
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
              className="mt-4 flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3"
              style={{ borderWidth: 1, borderColor: "#eee7da" }}
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

function WordRow({ entry }: { entry: Word }) {
  return (
    <View
      className="flex-row items-center rounded-2xl bg-white px-4 py-3.5"
      style={{
        shadowColor: colors.ink,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: "Outfit_600SemiBold", fontSize: 15, color: colors.ink }}>
            {entry.text}
          </Text>
          <Text className="text-xs italic text-ink/40" style={{ fontFamily: "Outfit" }}>
            {entry.partOfSpeech}
          </Text>
        </View>
        <Text className="mt-0.5 text-sm text-ink/60" style={{ fontFamily: "Outfit" }}>
          {entry.meaningVi}
        </Text>
      </View>
      <Pressable
        onPress={() => Speech.speak(entry.text, { language: "en-US" })}
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: "#e0e7ff" }}
      >
        <Volume2 size={16} color={colors.indigo600} />
      </Pressable>
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
