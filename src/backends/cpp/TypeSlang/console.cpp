namespace JS {
class Console {
public:
  template <class T1> void info(T1 value) { fmt::print("{}\n", value); }

  template <class T1, class T2> void info(T1 value1, T2 value2) { fmt::print("{} {}\n", value1, value2); }

  template <class T1, class T2, class T3> void info(T1 value1, T2 value2, T3 value3) {
    fmt::print("{} {} {}\n", value1, value2, value3);
  }

  template <class T1, class T2, class T3, class T4> void info(T1 value1, T2 value2, T3 value3, T4 value4) {
    fmt::print("{} {} {} {}\n", value1, value2, value3, value4);
  }

  template <class T1, class T2, class T3, class T4, class T5>
  void info(T1 value1, T2 value2, T3 value3, T4 value4, T5 value5) {
    fmt::print("{} {} {} {} {}\n", value1, value2, value3, value4, value5);
  }
};
} // namespace JS