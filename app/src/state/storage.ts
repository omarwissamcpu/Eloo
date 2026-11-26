import AsyncStorage from '@react-native-async-storage/async-storage';

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem('eloo:' + key);
    return raw == null ? fallback : { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export async function store(key: string, value: unknown) {
  try {
    if (value == null) await AsyncStorage.removeItem('eloo:' + key);
    else await AsyncStorage.setItem('eloo:' + key, JSON.stringify(value));
  } catch {
    // Storage is best-effort; the app keeps working with in-memory state.
  }
}
