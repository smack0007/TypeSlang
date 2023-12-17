namespace JS {
class Number {
public:
  template <typename T> static String toString(T value, u8 radix = 10) {
    auto format = "{}";

    switch (radix) {
    case 2:
      format = "{:b}";
      break;

    case 10:
      break;

    case 16:
      format = "{:x}";
      break;

    default:
      throw Error("Unsupported radix.");
    }

    return String(fmt::format(fmt::runtime(format), value));
  }
};
} // namespace JS